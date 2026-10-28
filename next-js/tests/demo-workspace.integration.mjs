import assert from "node:assert/strict";
import test from "node:test";
import { addReportingDays, getReportingDate, utcInstantFromEpochMilliseconds } from "../src/domain/calendar.ts";
import { getDatabase, disconnectDatabase } from "../src/server/database/client.ts";
import { demoId } from "../src/server/demo/forecast.ts";
import { seedDemoWorkspace } from "../src/server/demo/workspace-seed.ts";
import { seedDemoMember } from "../src/server/demo/member-seed.ts";
import { createSubscribers } from "../src/server/admin/subscribers.ts";
import { createPaymentReview } from "../src/server/admin/payment-review.ts";
import { createAnalyticsReporter } from "../src/server/analytics/analytics-report.ts";
import { getAnalyticsServices, verifyAdminSession } from "../src/server/analytics/analytics-http.ts";
import { createMemberAuth } from "../src/server/members/member-auth.ts";
import { fixtureAdminPhone, fixtureAdminPassword, installAdminFixtureEnvironment } from "./helpers/admin-fixtures.mjs";

test("isolated demo populates protected owner screens through normal services and administrator authentication", {
  skip: process.env.DEMO_DATABASE_INTEGRATION !== "1", timeout: 240_000,
}, async (t) => {
  t.after(installAdminFixtureEnvironment());
  const database = getDatabase(), nowMs = Date.now();
  t.after(disconnectDatabase);
  await seedDemoMember(database, nowMs);
  await seedDemoWorkspace(database, nowMs);
  const ids = Array.from({ length: 48 }, (_, index) => demoId("workspace-member", index));
  const today = getReportingDate(utcInstantFromEpochMilliseconds(nowMs));
  const visits = Array.from({ length: 61 }, (_, day) => Array.from({ length: 36 }, (_, visit) =>
    demoId("workspace-visit", `${addReportingDays(today, -day)}:${visit}`))).flat();
  async function counts() {
    return database.query(async (tx) => ({
      members: await tx.memberAccount.count({ where: { id: { in: ids } } }),
      payments: await tx.paymentSubmission.count({ where: { accountId: { in: ids } } }),
      wallet: await tx.walletEntry.count({ where: { accountId: { in: ids } } }),
      visits: await tx.analyticsSession.count({ where: { id: { in: visits } } }),
      events: await tx.analyticsEvent.count({ where: { sessionId: { in: visits } } }),
    }));
  }
  const before = await counts();
  assert.equal(before.members, 48); assert.ok(before.payments >= 48); assert.ok(before.wallet >= 48);
  assert.ok(before.visits >= 2196); assert.ok(before.events > 4392);
  await seedDemoWorkspace(database, nowMs);
  assert.deepEqual(await counts(), before, "restarting does not duplicate visits or financial records");
  const subscribers = createSubscribers(database), overview = await subscribers.overview();
  assert.ok(overview.pending > 0); assert.ok(overview.active > 0); assert.ok(overview.monthRevenue > 0);
  assert.ok((await subscribers.passwordResetRequests()).length > 0);
  const detail = await subscribers.detail(ids[1]);
  assert.ok(detail?.wallet.length); assert.ok(detail?.submissions.length); assert.ok(detail?.codes.length);
  const review = createPaymentReview(database);
  for (const tab of ["pending", "approved", "rejected", "superseded"]) assert.ok((await review.list(tab)).payments.length > 0);
  const report = await createAnalyticsReporter(database).report({ from: addReportingDays(today, -29), to: today, compare: "previous", filters: {} });
  assert.ok(report.summary.visits > 0); assert.ok(report.summary.conversions > 0);
  assert.ok(report.previous?.visits > 0); assert.ok(report.breakdowns.conversions.length > 0);
  assert.ok(report.breakdowns.searches.length > 0); assert.ok(report.breakdowns.outbound.length > 0);
  const services = await getAnalyticsServices();
  assert.equal(await verifyAdminSession(services, undefined), null, "a cookie-free public demo visitor is not an administrator");
  const auth = createMemberAuth({ database, config: services.config });
  const login = await auth.login(fixtureAdminPhone, fixtureAdminPassword, "demo-workspace-integration");
  assert.equal(login.status, "authenticated"); assert.equal(login.administrator, true);
  assert.ok(await verifyAdminSession(services, login.token));
  t.diagnostic("Owner overview, all payment tabs, subscriber history, reset queue, analytics and normal admin login passed.");
});
