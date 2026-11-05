import "server-only";

import { createHash } from "node:crypto";
import { getReportingDate, getReportingDayBounds, utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import { analyticsChannels, analyticsGoals } from "../../domain/analytics.ts";
import { screenBucket } from "../../domain/analytics-classify.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { demoId } from "./forecast.ts";
import { assertDemoDatabase } from "./member.ts";

const dayMs = 86_400_000;
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

/** Synthetic football and analytics remain available without generating financial or subscriber examples. */
export async function seedDemoWorkspace(database: DatabaseRuntime, nowMs = Date.now()): Promise<void> {
  assertDemoDatabase();
  const [identity] = await database.query((tx) => tx.$queryRaw<{ name: string }[]>`SELECT DATABASE() AS name`);
  if (!identity || !/^goal_hint_demo(?:_[a-z0-9_]+)?$/u.test(identity.name)) throw new Error("Demo workspace records require the isolated database.");
  await seedDemoAnalytics(database, nowMs);
}

/** Bounded, deterministic visits over the latest 61 days populate every analytics breakdown and conversion family. */
async function seedDemoAnalytics(database: DatabaseRuntime, nowMs: number) {
  const marker = `demo-visits:${getReportingDate(utcInstantFromEpochMilliseconds(nowMs))}`;
  if (await database.query((tx) => tx.analyticsSetting.findUnique({ where: { key: marker } }))) return;
  const channels = Object.keys(analyticsChannels), regions = [["UG", "Kampala"], ["KE", "Nairobi"], ["TZ", "Dar es Salaam"],
    ["GB", "London"], ["NG", "Lagos"], ["ZA", "Johannesburg"], ["US", "New York"], ["IN", "Mumbai"]] as const;
  const pages = [["/en", "/[locale]"], ["/en/slips", "/[locale]/slips"], ["/en/subscribe", "/[locale]/subscribe"],
    ["/en/performance", "/[locale]/performance"], ["/en/account", "/[locale]/account"],
    [`/en/matches/${demoId("fixture", 900_000_001)}/demo-match`, "/[locale]/matches/[id]/[slug]"]] as const;
  for (let day = 60; day >= 0; day--) {
    const date = getReportingDate(utcInstantFromEpochMilliseconds(nowMs - day * dayMs));
    const key = `demo-visits:${date}`;
    await database.transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM SubscriptionSettings WHERE id=1 FOR UPDATE`;
      if (await tx.analyticsSetting.findUnique({ where: { key } })) return;
      const sessions = [], views = [], events = [];
      const bounds = getReportingDayBounds(date);
      const latestStart = Math.max(bounds.startInclusive, Math.min(nowMs, bounds.endExclusive - 1) - 50_000);
      for (let visit = 0; visit < 36; visit++) {
        const seed = `${date}:${visit}`, id = demoId("workspace-visit", seed);
        const visitorId = digest(visit < 24 ? `demo-visitor:${visit}` : `demo-new-visitor:${seed}`);
        const startedAt = new Date(Math.max(bounds.startInclusive, latestStart - (visit + 1) * 60_000));
        const lastSeenAt = new Date(Math.min(nowMs, bounds.endExclusive - 1, startedAt.getTime() + 15_000 + visit * 1000));
        const engagedMs = lastSeenAt.getTime() - startedAt.getTime();
        const [country, city] = regions[visit % regions.length]!, page = pages[visit % pages.length]!, channel = channels[visit % channels.length]!;
        const pageviewId = demoId("workspace-pageview", `${seed}:2`);
        const interactions = [
          { type: visit % 3 === 0 ? "custom" : "click", name: visit % 3 === 0 ? visit % 2 === 0 ? "slip_build" : "payment_submitted" : "Open match", target: null },
          { type: ["search", "outbound", "download", "click"][visit % 4]!,
            name: ["demo club", "api-football.com", "demo-fixtures.json", "Open slips"][visit % 4]!,
            target: visit % 4 === 1 ? "https://www.api-football.com/" : visit % 4 === 2 ? "/api/demo/football/fixtures" : null },
        ];
        const goals = analyticsGoals.filter((goal) => goal.kind === "pageview" ? goal.route === page[1]
          : interactions.some((event) => goal.type === event.type && (!("name" in goal) || goal.name === event.name)));
        const visitor = await tx.analyticsVisitor.upsert({ where: { id: visitorId }, update: { lastSeenAt, sessionCount: { increment: 1 } },
          create: { id: visitorId, firstSeenAt: startedAt, lastSeenAt, sessionCount: 1 } });
        sessions.push({ id, visitorId, startedAt, lastSeenAt, isNewVisitor: visitor.sessionCount === 1, visitNumber: visitor.sessionCount, entryPath: "/en", entryRoute: "/[locale]",
          exitPath: page[0], exitRoute: page[1], pageviews: 2, interactions: 2, engagedMs, converted: goals.length > 0,
          channel, referrerHost: channel === "organic-search" ? "www.google.com" : channel === "social" ? "facebook.com" : null,
          utmSource: channel === "campaign" ? "demo-newsletter" : null, utmMedium: channel === "campaign" ? "email" : null,
          utmCampaign: channel === "campaign" ? "demo-matchday" : null, deviceType: visit % 5 === 0 ? "desktop" : visit % 7 === 0 ? "tablet" : "mobile",
          browser: visit % 3 === 0 ? "Safari" : "Chrome", os: visit % 3 === 0 ? "iOS" : "Android", country, city, geoSource: "edge", language: "en", screen: screenBucket(visit % 5 === 0 ? 1365 : 375) });
        for (let sequence = 1; sequence <= 2; sequence++) views.push({ id: demoId("workspace-pageview", `${seed}:${sequence}`), sessionId: id,
          visitorId, occurredAt: new Date(Math.min(lastSeenAt.getTime(), startedAt.getTime() + (sequence - 1) * 10_000)), sequence,
          path: sequence === 1 ? "/en" : page[0], route: sequence === 1 ? "/[locale]" : page[1], title: "Goal Hint synthetic visit",
          previousPath: sequence === 1 ? null : "/en", engagedMs: Math.floor(engagedMs / 2) });
        events.push(...interactions.map((event) => ({ ...event, sessionId: id, visitorId, pageviewId, occurredAt: lastSeenAt, path: page[0] })),
          ...goals.map((goal) => ({ sessionId: id, visitorId, pageviewId, occurredAt: lastSeenAt, type: "conversion", name: goal.id, path: page[0], target: null })));
      }
      await tx.analyticsSession.createMany({ data: sessions });
      await tx.analyticsPageview.createMany({ data: views });
      await tx.analyticsEvent.createMany({ data: events });
      await tx.analyticsSetting.create({ data: { key, value: "synthetic", updatedAt: new Date(nowMs) } });
    }, { isolationLevel: "ReadCommitted", timeout: 30_000 });
  }
}
