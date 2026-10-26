import "server-only";

import { analyticsGoals, analyticsRoute, analyticsRules, type CollectPayload } from "../../domain/analytics.ts";
import { classifyChannel, normalizeFreeText, normalizeLanguage, normalizeSearchTerm, sanitizeTarget, screenBucket,
  summarizeClient } from "../../domain/analytics-classify.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import type { AnalyticsConfig } from "./analytics-config.ts";
import { timeZoneCountries } from "./analytics-timezones.ts";

export type CollectContext = Readonly<{
  userAgent: string;
  /** `Sec-CH-UA-Mobile`, when the browser sends client hints. */
  mobileHint: boolean | null;
  /** The site's own host, so internal navigation is never recorded as a referrer. */
  host: string;
  edge: Readonly<{ country: string | null; city: string | null }> | null;
}>;

export type CollectResult = Readonly<{ accepted: number; dropped: number; reason?: "unknown-session" | "visitor-mismatch" | "expired-session" }>;

type SessionRow = {
  id: string; visitorId: string; lastSeenAt: Date; pageviews: number; interactions: number; engagedMs: number;
  exitPath: string; exitRoute: string; converted: number | boolean;
};

const nonEmpty = (value: string | undefined, maximum: number) => {
  const text = value === undefined ? "" : normalizeFreeText(value, maximum);
  return text.length > 0 ? text : null;
};

/** Approximate location: a trusted edge header when configured, otherwise the browser's IANA time zone. */
export function resolveLocation(timeZone: string | undefined, edge: CollectContext["edge"]) {
  const country = edge?.country?.toUpperCase();
  if (country && /^[A-Z]{2}$/.test(country) && !["XX", "T1"].includes(country)) {
    return { country, city: edge?.city ? normalizeFreeText(edge.city, 96) || null : null, geoSource: "edge" };
  }
  const zoneCountry = timeZone ? timeZoneCountries[timeZone] : undefined;
  if (!zoneCountry || !timeZone) return { country: null, city: null, geoSource: "unknown" };
  return { country: zoneCountry, city: (timeZone.split("/").pop() ?? "").replace(/_/g, " ").slice(0, 96) || null, geoSource: "timezone" };
}

export function createAnalyticsCollector({ database, config, now = Date.now }: { database: DatabaseRuntime; config: AnalyticsConfig; now?: () => number }) {
  return Object.freeze({
    async collect(payload: CollectPayload, context: CollectContext): Promise<CollectResult> {
      const at = new Date(now());
      const visitorId = config.key("visitor", payload.vid);
      return database.transaction(async (tx) => {
        const select = async () => (await tx.$queryRaw<SessionRow[]>`
          SELECT id, visitorId, lastSeenAt, pageviews, interactions, engagedMs, exitPath, exitRoute, converted
          FROM AnalyticsSession WHERE id = ${payload.sid} FOR UPDATE`)[0];
        let session = await select();
        if (session === undefined) {
          const first = payload.events.find((event) => event.t === "pageview");
          if (first === undefined) return { accepted: 0, dropped: payload.events.length, reason: "unknown-session" } as const;
          const [visitor] = await tx.$queryRaw<{ sessionCount: number }[]>`
            SELECT sessionCount FROM AnalyticsVisitor WHERE id = ${visitorId} FOR UPDATE`;
          const visitNumber = visitor === undefined ? 1 : Number(visitor.sessionCount) + 1;
          if (visitor === undefined) await tx.analyticsVisitor.create({ data: { id: visitorId, firstSeenAt: at, lastSeenAt: at, sessionCount: 1 } });
          else await tx.analyticsVisitor.update({ where: { id: visitorId }, data: { lastSeenAt: at, sessionCount: visitNumber } });
          // Real browser user agents are far shorter; the cap bounds pattern work on this public endpoint.
          const client = summarizeClient(context.userAgent.slice(0, 1024), { mobileHint: context.mobileHint, touchPoints: payload.ctx.tp ?? null,
            screenWidth: payload.ctx.sw ?? null });
          const location = resolveLocation(payload.ctx.tz, context.edge);
          const ownHost = context.host.toLowerCase().replace(/^www\./, "").split(":")[0] ?? "";
          const host = first.ref && first.ref !== ownHost ? first.ref.replace(/^www\./, "") : null;
          const utm = first.utm;
          const route = analyticsRoute(first.path);
          await tx.analyticsSession.createMany({ skipDuplicates: true, data: [{
            id: payload.sid, visitorId, startedAt: at, lastSeenAt: at, isNewVisitor: visitor === undefined, visitNumber,
            entryPath: first.path, entryRoute: route, exitPath: first.path, exitRoute: route,
            pageviews: 0, interactions: 0, engagedMs: 0, converted: false,
            channel: classifyChannel(host, utm), referrerHost: host,
            utmSource: nonEmpty(utm?.source, 100), utmMedium: nonEmpty(utm?.medium, 100), utmCampaign: nonEmpty(utm?.campaign, 100),
            utmTerm: nonEmpty(utm?.term, 100), utmContent: nonEmpty(utm?.content, 100),
            deviceType: client.deviceType, browser: client.browser, browserVersion: client.browserVersion, os: client.os, osVersion: client.osVersion,
            country: location.country, city: location.city, geoSource: location.geoSource,
            language: normalizeLanguage(payload.ctx.lang), screen: screenBucket(payload.ctx.sw),
          }] });
          session = await select();
          if (session === undefined) return { accepted: 0, dropped: payload.events.length, reason: "unknown-session" } as const;
        }
        if (session.visitorId !== visitorId) return { accepted: 0, dropped: payload.events.length, reason: "visitor-mismatch" } as const;
        // The browser starts a new visit after 30 idle minutes; late events from a sleeping tab are not stitched on.
        if (session.pageviews > 0 && at.getTime() - session.lastSeenAt.getTime() > analyticsRules.sessionIdleMs + 5 * 60_000) {
          return { accepted: 0, dropped: payload.events.length, reason: "expired-session" } as const;
        }
        const state = { pageviews: Number(session.pageviews), interactions: Number(session.interactions), engagedMs: Number(session.engagedMs),
          exitPath: session.exitPath, exitRoute: session.exitRoute, converted: Boolean(session.converted) };
        const pages = new Map<string, string | null>();
        const goalsReached = new Set<string>();
        let accepted = 0;

        async function pagePath(id: string): Promise<string | null> {
          if (!pages.has(id)) {
            const [row] = await tx.$queryRaw<{ path: string }[]>`SELECT path FROM AnalyticsPageview WHERE id = ${id} AND sessionId = ${payload.sid}`;
            pages.set(id, row?.path ?? null);
          }
          return pages.get(id) ?? null;
        }
        async function convert(goal: string, pageviewId: string, path: string) {
          if (goalsReached.has(goal)) return;
          goalsReached.add(goal);
          const [existing] = await tx.$queryRaw<{ found: number }[]>`
            SELECT 1 AS found FROM AnalyticsEvent WHERE sessionId = ${payload.sid} AND type = 'conversion' AND name = ${goal} LIMIT 1`;
          if (existing) return;
          await tx.analyticsEvent.create({ data: { sessionId: payload.sid, visitorId, pageviewId, occurredAt: at, type: "conversion", name: goal, path } });
          state.converted = true;
        }
        async function record(type: string, pageviewId: string, path: string, name: string, target: string | null) {
          await tx.analyticsEvent.create({ data: { sessionId: payload.sid, visitorId, pageviewId, occurredAt: at, type, name, path, target } });
          state.interactions++;
          for (const goal of analyticsGoals) {
            if (goal.kind === "event" && goal.type === type && (!("name" in goal) || goal.name === name)) await convert(goal.id, pageviewId, path);
          }
        }

        for (const event of payload.events) {
          if (event.t === "pageview") {
            const route = analyticsRoute(event.path);
            const inserted = await tx.analyticsPageview.createMany({ skipDuplicates: true, data: [{
              id: event.id, sessionId: payload.sid, visitorId, occurredAt: at, sequence: state.pageviews + 1, path: event.path, route,
              title: nonEmpty(event.title, 200), previousPath: state.pageviews > 0 ? state.exitPath : null, engagedMs: 0 }] });
            if (inserted.count === 0) continue;
            pages.set(event.id, event.path);
            state.pageviews++; state.exitPath = event.path; state.exitRoute = route; accepted++;
            for (const goal of analyticsGoals) if (goal.kind === "pageview" && goal.route === route) await convert(goal.id, event.id, event.path);
            continue;
          }
          const path = await pagePath(event.pv);
          if (path === null) continue;
          accepted++;
          switch (event.t) {
            case "engage": {
              const updated = await tx.$executeRaw`UPDATE AnalyticsPageview
                SET engagedMs = LEAST(engagedMs + ${event.ms}, ${analyticsRules.maximumPageEngagedMs}) WHERE id = ${event.pv} AND sessionId = ${payload.sid}`;
              if (updated > 0) state.engagedMs = Math.min(state.engagedMs + event.ms, 86_400_000);
              break;
            }
            case "click": {
              const label = normalizeFreeText(event.label, 120) || "(unlabelled)";
              const target = event.href ? sanitizeTarget(event.href, `https://${context.host}`) : null;
              await record("click", event.pv, path, label, target ? new URL(target.target).pathname.slice(0, 512) : null);
              break;
            }
            case "outbound": {
              const target = sanitizeTarget(event.href, `https://${context.host}`);
              if (target) await record("outbound", event.pv, path, target.host, target.target);
              break;
            }
            case "download": {
              const target = sanitizeTarget(event.href, `https://${context.host}`);
              if (target) await record("download", event.pv, path, target.file || target.host, target.target);
              break;
            }
            case "search": {
              const term = normalizeSearchTerm(event.term);
              if (term) await record("search", event.pv, path, term, null);
              break;
            }
            case "custom":
              await record("custom", event.pv, path, event.name, null);
              break;
          }
        }
        await tx.analyticsSession.update({ where: { id: payload.sid }, data: { lastSeenAt: at, pageviews: state.pageviews,
          interactions: state.interactions, engagedMs: state.engagedMs, exitPath: state.exitPath, exitRoute: state.exitRoute, converted: state.converted } });
        return { accepted, dropped: payload.events.length - accepted };
      }, { isolationLevel: "ReadCommitted", timeout: 10_000 });
    },
  });
}
export type AnalyticsCollector = ReturnType<typeof createAnalyticsCollector>;

/** Per-process abuse bounds: each visit and the whole process get a fixed event budget per window. */
export function createCollectLimiter({ perSession = 300, perProcess = 6_000, windowMs = 60_000, now = Date.now } = {}) {
  let windowStart = now();
  let total = 0;
  const sessions = new Map<string, number>();
  return Object.freeze({
    allow(sessionId: string, events: number): boolean {
      if (now() - windowStart >= windowMs) { windowStart = now(); total = 0; sessions.clear(); }
      const used = sessions.get(sessionId) ?? 0;
      if (used + events > perSession || total + events > perProcess || sessions.size >= 50_000) return false;
      sessions.set(sessionId, used + events); total += events;
      return true;
    },
  });
}
