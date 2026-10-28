import "server-only";

import { createHash } from "node:crypto";
import { getReportingDate, getReportingDayBounds, utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import { analyticsChannels, analyticsGoals } from "../../domain/analytics.ts";
import { screenBucket } from "../../domain/analytics-classify.ts";
import { writeOwnerAudit } from "../admin/audit.ts";
import { hashPassword } from "../analytics/analytics-password.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { hashCode } from "../members/access-codes.ts";
import { appendWalletEntry } from "../members/wallet.ts";
import { demoId } from "./forecast.ts";
import { assertDemoDatabase, demoMember } from "./member.ts";

export const demoAdmin = Object.freeze({ phone: "256700000099", password: "DemoGoalHintAdmin2026!" });
const dayMs = 86_400_000, workspaceMarker = "development-demo-workspace-v1";
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const planDefinitions = [
  { name: "Demo daily access", durationDays: 1, priceUgx: 1000, active: true },
  { name: "Demo weekly access", durationDays: 7, priceUgx: 5000, active: true },
  { name: "Demo monthly access", durationDays: 30, priceUgx: 15000, active: true },
  { name: "Demo retired offer", durationDays: 14, priceUgx: 8000, active: false },
] as const;

/** Application-owned examples complement the provider data; no such fields enter raw API-Football envelopes.
 * Initial records are inserted once. Subsequent starts preserve edits, decisions, balances and sign-outs. */
export async function seedDemoWorkspace(database: DatabaseRuntime, nowMs = Date.now()): Promise<void> {
  assertDemoDatabase();
  const [identity] = await database.query((tx) => tx.$queryRaw<{ name: string }[]>`SELECT DATABASE() AS name`);
  if (!identity || !/^goal_hint_demo(?:_[a-z0-9_]+)?$/u.test(identity.name)) throw new Error("Demo workspace records require the isolated database.");
  const at = new Date(nowMs);
  const marker = await database.query((tx) => tx.analyticsSetting.findUnique({ where: { key: workspaceMarker } }));
  if (!marker) {
    const passwordHash = await hashPassword(demoMember.password);
    await database.transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM SubscriptionSettings WHERE id=1 FOR UPDATE`;
      if (await tx.analyticsSetting.findUnique({ where: { key: workspaceMarker } })) return;
      const plans = planDefinitions.map((plan, index) => ({ ...plan, id: demoId("workspace-plan", index), sortOrder: index + 1,
        createdAt: new Date(nowMs - 60 * dayMs), updatedAt: at }));
      await tx.subscriptionPlan.createMany({ data: plans });
      await tx.memberAccount.create({ data: { id: demoId("workspace-admin", 0), phone: demoAdmin.phone,
        createdAt: at, lastSignInAt: at, ownerNote: "Synthetic local administrator; sign in with the documented demo credential." } });
      for (let index = 0; index < 48; index++) {
        const id = demoId("workspace-member", index), phone = `25670000${String(index + 1000).padStart(4, "0")}`;
        const createdAt = new Date(nowMs - (index + 2) * dayMs), plan = plans[index % 3]!;
        await tx.memberAccount.create({ data: { id, phone, passwordHash, phoneVerifiedAt: createdAt,
          passwordChangedAt: createdAt, createdAt, lastSignInAt: new Date(nowMs - index * 1_800_000),
          ownerNote: `Synthetic development member ${index + 1}`, blockedAt: index % 19 === 0 ? at : null,
          blockedReason: index % 19 === 0 ? "Synthetic blocked-account example" : null,
          passwordResetRequestedAt: index % 13 === 0 ? new Date(nowMs - (index + 1) * 60_000) : null,
          trialRequestedAt: index % 11 === 0 ? at : null } });
        const status = (["pending", "approved", "approved", "rejected", "superseded", "reversed"] as const)[index % 6]!;
        const approved = status === "approved" || status === "reversed", network = index % 2 === 0 ? "mtn" : "airtel";
        const paymentId = demoId("workspace-payment", index), submittedAt = new Date(nowMs - (index % 28) * dayMs - 3_600_000);
        const decidedAt = approved || status === "rejected" || status === "superseded" ? new Date(submittedAt.getTime() + 1_200_000) : null;
        const transactionRef = `DEMO${String(index + 1).padStart(6, "0")}`;
        await tx.paymentSubmission.create({ data: { id: paymentId, reference: `D${String(index + 100).padStart(3, "0")}`,
          source: "report", accountId: id, purpose: "plan", planId: plan.id, planName: plan.name,
          durationDays: plan.durationDays, priceUgx: plan.priceUgx, payerPhone: phone, claimedNetwork: network,
          claimedTxnRef: transactionRef, claimedTxnKey: transactionRef.toLowerCase(), claimedAmountUgx: plan.priceUgx,
          status, submittedAt, decidedAt, decidedBy: decidedAt ? "development-demo" : null,
          rejectReason: status === "rejected" ? "amount-mismatch" : null,
          rejectText: status === "rejected" ? "Synthetic review example: the received amount differs from the selected plan." : null,
          network: approved ? network : null, transactionRef: approved ? transactionRef : null,
          amountReceivedUgx: approved ? plan.priceUgx : null,
          approvedTxnKey: approved ? `${network}:${transactionRef.toLowerCase()}` : null,
          reversedAt: status === "reversed" ? at : null, reverseReason: status === "reversed" ? "network-reversal" : null } });
        if (approved || index % 5 === 0) {
          const salt = new Uint8Array(createHash("sha256").update(id).digest().subarray(0, 16));
          const startsAt = approved ? decidedAt! : createdAt, endsAt = new Date(startsAt.getTime() + plan.durationDays * dayMs);
          await tx.accessCode.create({ data: { id: demoId("workspace-access", index), accountId: id,
            codeSalt: salt, codeHash: hashCode(salt, `DEVS2026${String(index).padStart(4, "0")}`), reference: `A${String(index + 100).padStart(3, "0")}`,
            source: approved ? "payment" : "manual", paymentSubmissionId: approved ? paymentId : null,
            planId: plan.id, planName: plan.name, durationDays: plan.durationDays, priceUgx: approved ? plan.priceUgx : 0,
            amountReceivedUgx: approved ? plan.priceUgx : 0, createdAt: startsAt, createdBy: "development-demo", activatedAt: startsAt,
            startsAt, endsAt, revokedAt: status === "reversed" ? at : null,
            revokedReason: status === "reversed" ? "payment-reversed" : null, note: "Synthetic development access example" } });
        }
        await appendWalletEntry(tx, id, { kind: "adjustment", amountUgx: (index % 5 + 1) * 5000, actor: "admin", at: createdAt,
          requestKey: `development-demo-wallet-${index}`, note: "Synthetic development credit" });
        if (status === "reversed") await writeOwnerAudit(tx, { at: decidedAt!, actor: "development-demo", accountId: id,
          action: "payment_approved", targetType: "payment", targetId: paymentId, details: { synthetic: true, amountUgx: plan.priceUgx } });
        await writeOwnerAudit(tx, { at: status === "reversed" ? at : decidedAt ?? submittedAt, actor: "development-demo", accountId: id,
          action: status === "approved" ? "payment_approved" : status === "rejected" ? "payment_rejected"
            : status === "reversed" ? "payment_reversed" : "payment_submitted",
          targetType: "payment", targetId: paymentId, details: { synthetic: true, status, amountUgx: plan.priceUgx } });
      }
      await tx.analyticsSetting.create({ data: { key: workspaceMarker, value: "complete", updatedAt: at } });
    }, { isolationLevel: "ReadCommitted", timeout: 60_000 });
  }
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
