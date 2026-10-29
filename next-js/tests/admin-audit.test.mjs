import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { auditActionLabel, auditActorLabel, auditCategories, auditCategory, auditCategoryLabel, auditCsv, auditDateBounds,
  auditDay, auditReference, auditTargetLabel, filterAuditRows } from "../src/domain/admin-audit.ts";

const accountId = "00000000-0000-4000-8000-000000000100";
const row = (change = {}) => ({ id: "17", at: "2026-10-23T09:30:00.000Z", actor: `member-admin:${accountId}`,
  action: "payment_approved", accountId, targetType: "payment", targetId: "P-EXAMPLE", ...change });

test("every recorded action has a friendly label and an explicit category without importing server code", async () => {
  const source = await readFile(new URL("../src/server/admin/audit.ts", import.meta.url), "utf8");
  const actions = [...source.match(/ownerAuditActions = Object\.freeze\(\[([\s\S]*?)\] as const\)/u)[1].matchAll(/"([a-z_]+)"/gu)].map(match => match[1]);
  assert.ok(actions.length > 30);
  for (const action of actions) {
    assert.notEqual(auditCategory(action), "other", action);
    assert.doesNotMatch(auditActionLabel(action), /_/u, action);
  }
  assert.equal(new Set(auditCategories.map(item => item.value)).size, auditCategories.length);
  assert.equal(auditActionLabel("payment_approved"), "Payment approved");
  assert.equal(auditCategoryLabel(auditCategory("password_reset")), "Sign-in & security");
  assert.equal(auditTargetLabel("member-session"), "Device");
});

test("new action names remain readable and opaque actors do not become primary labels", () => {
  assert.equal(auditActionLabel("future_memberUpdate"), "Future member update");
  assert.equal(auditActionLabel("SMSDeliveryRetried"), "SMS delivery retried");
  assert.equal(auditActionLabel("constructor"), "Constructor");
  assert.equal(auditActionLabel("_-_"), "Other event");
  assert.equal(auditCategory("new_unknown_event"), "other");
  assert.equal(auditTargetLabel("customRecord"), "Custom record");
  assert.equal(auditActorLabel(`member-admin:${accountId}`), "Administrator");
  assert.equal(auditActorLabel("system:payment-sms"), "System");
  assert.equal(auditActorLabel("member"), "Subscriber");
  assert.equal(auditActorLabel("unverified"), "Unverified visitor");
  assert.equal(auditActorLabel(accountId), "Unknown actor");
  assert.equal(auditActorLabel("a".repeat(64)), "Unknown actor");
  assert.equal(auditActorLabel("t".repeat(43)), "Unknown actor");
  assert.equal(auditActorLabel("deleted-admin"), "Former administrator");
  assert.equal(auditActorLabel("  José  "), "José");
});

test("EAT days and limited filters use calendar boundaries and exclude future or invalid events", () => {
  assert.equal(auditDay("2026-10-22T20:59:59Z"), "2026-10-22");
  assert.equal(auditDay("2026-10-22T21:00:00Z"), "2026-10-23");
  assert.equal(auditDay("not-a-date"), "");
  const now = Date.parse("2026-10-23T09:00:00Z");
  const rows = [
    row({ id: "today", at: "2026-10-22T21:00:00Z" }),
    row({ id: "yesterday", at: "2026-10-22T20:59:59Z" }),
    row({ id: "seventh", at: "2026-10-16T21:00:00Z" }),
    row({ id: "eighth", at: "2026-10-16T20:59:59Z" }),
    row({ id: "thirtieth", at: "2026-09-23T21:00:00Z" }),
    row({ id: "too-old", at: "2026-09-23T20:59:59Z" }),
    row({ id: "later-today", at: "2026-10-23T10:00:00Z" }),
    row({ id: "invalid", at: "invalid" }),
  ];
  const ids = period => filterAuditRows(rows, { period, now }).map(item => item.id);
  assert.deepEqual(ids("today"), ["today"]);
  assert.deepEqual(ids("7days"), ["today", "yesterday", "seventh"]);
  assert.deepEqual(ids("30days"), ["today", "yesterday", "seventh", "eighth", "thirtieth"]);
  assert.deepEqual(ids("all"), rows.map(item => item.id));
  assert.deepEqual(filterAuditRows(rows, { period: "today", now: NaN }), []);
  assert.deepEqual(filterAuditRows(rows, { period: "today", now: 1e99 }), []);
});

test("search combines friendly labels and identifier lookups with exact category filtering in source order", () => {
  const rows = [row({ id: "21", actor: "José", targetId: "P-FIRST" }),
    row({ id: "18", actor: "José", action: "plan_created", targetType: "plan", targetId: "plan-ref" }),
    row({ id: "19", targetId: "P-SECOND" })];
  assert.deepEqual(filterAuditRows(rows, { search: "JOSE payments approved" }), [rows[0]]);
  assert.deepEqual(filterAuditRows(rows, { search: "administrator P-second", category: "payments" }), [rows[2]]);
  assert.deepEqual(filterAuditRows(rows, { category: "payments" }), [rows[0], rows[2]]);
  assert.deepEqual(filterAuditRows(rows, { search: accountId }), rows);
  assert.deepEqual(filterAuditRows(rows, { search: "18" }), [rows[1]]);
  assert.deepEqual(filterAuditRows(rows, { category: "access" }), []);
  assert.equal(rows[0].targetId, "P-FIRST", "filtering does not mutate source rows");
});

test("the last hour includes its endpoints and crosses an EAT midnight without including future events", () => {
  const now = Date.parse("2026-10-22T21:30:00.000Z");
  const rows = [
    row({ id: "before", at: "2026-10-22T20:29:59.999Z" }),
    row({ id: "start", at: "2026-10-22T20:30:00.000Z" }),
    row({ id: "now", at: "2026-10-22T21:30:00.000Z" }),
    row({ id: "future", at: "2026-10-22T21:30:00.001Z" }),
    row({ id: "invalid", at: "invalid" }),
  ];
  assert.deepEqual(filterAuditRows(rows, { period: "1hour", now }).map(item => item.id), ["start", "now"]);
  assert.deepEqual(auditDateBounds({ period: "1hour", now }), {
    gte: new Date("2026-10-22T20:30:00.000Z"), lt: new Date("2026-10-22T21:30:00.001Z"),
  });
});

test("month presets use reporting dates, clamp February and cross year boundaries", () => {
  const cases = [
    ["3months", "2026-05-31T09:00:00Z", "2026-02-27T21:00:00.000Z"],
    ["6months", "2026-08-31T09:00:00Z", "2026-02-27T21:00:00.000Z"],
    ["6months", "2024-08-31T09:00:00Z", "2024-02-28T21:00:00.000Z"],
    ["3months", "2026-01-30T21:00:00Z", "2025-10-30T21:00:00.000Z"],
  ];
  for (const [period, instant, earliest] of cases) {
    const now = Date.parse(instant), start = Date.parse(earliest);
    const rows = [row({ id: "before", at: new Date(start - 1).toISOString() }), row({ id: "start", at: earliest }),
      row({ id: "now", at: instant }), row({ id: "future", at: new Date(now + 1).toISOString() })];
    assert.deepEqual(filterAuditRows(rows, { period, now }).map(item => item.id), ["start", "now"], `${period}: ${instant}`);
    assert.deepEqual(auditDateBounds({ period, now }), { gte: new Date(start), lt: new Date(now + 1) });
  }
});

test("custom audit ranges include both full EAT dates, including a single selected day", () => {
  const rows = [
    row({ id: "before", at: "2026-10-21T20:59:59.999Z" }),
    row({ id: "start", at: "2026-10-21T21:00:00.000Z" }),
    row({ id: "last-day-start", at: "2026-10-22T21:00:00.000Z" }),
    row({ id: "end", at: "2026-10-23T20:59:59.999Z" }),
    row({ id: "after", at: "2026-10-23T21:00:00.000Z" }),
  ];
  const range = { period: "custom", startDate: "2026-10-22", endDate: "2026-10-23" };
  assert.deepEqual(filterAuditRows(rows, range).map(item => item.id), ["start", "last-day-start", "end"]);
  assert.deepEqual(auditDateBounds(range), {
    gte: new Date("2026-10-21T21:00:00.000Z"), lt: new Date("2026-10-23T21:00:00.000Z"),
  });
  assert.deepEqual(filterAuditRows(rows, { ...range, startDate: "2026-10-23" }).map(item => item.id), ["last-day-start", "end"]);
  assert.equal(auditDateBounds({ period: "all", startDate: "invalid", now: NaN }), null);
});

test("custom audit ranges reject missing, impossible, malformed and reversed dates", () => {
  const invalid = [
    { startDate: "", endDate: "2026-10-23" },
    { startDate: "2026-10-23", endDate: "" },
    { startDate: "2026-02-30", endDate: "2026-10-23" },
    { startDate: "2026-1-01", endDate: "2026-10-23" },
    { startDate: "2026-10-24", endDate: "2026-10-23" },
  ];
  for (const dates of invalid) {
    assert.throws(() => auditDateBounds({ period: "custom", ...dates }), { name: "CalendarValidationError" });
    assert.deepEqual(filterAuditRows([row()], { period: "custom", ...dates }), []);
  }
});

test("CSV includes only supplied rows and friendly fixed fields, UTF-8 and safely quoted formula cells", () => {
  const included = row({ id: "=EVENT()", at: "2026-10-22T21:00:00Z", actor: 'José, "Review"\nTeam',
    targetId: ' \t=HYPERLINK("unsafe")', accountId: "+ACCOUNT", details: { secret: "never-exported" }, unknown: "never-exported" });
  const excluded = row({ id: "excluded-event" });
  const csv = auditCsv(filterAuditRows([included, excluded], { search: "José" }));
  assert.ok(csv.startsWith("\uFEFFDate (EAT),Category,Event,Performed by,Target,Reference,Account,Event ID\r\n"));
  assert.match(csv, /2026-10-23 00:00:00,Payments,Payment approved/u);
  assert.ok(csv.includes('"José, ""Review""\nTeam"'));
  assert.ok(csv.includes('"\' \t=HYPERLINK(""unsafe"")"'));
  assert.ok(csv.endsWith(",'" + "+ACCOUNT,'=EVENT()\r\n"));
  assert.doesNotMatch(csv, /never-exported|excluded-event|member-admin:/u);
  assert.equal(auditCsv([]), "\uFEFFDate (EAT),Category,Event,Performed by,Target,Reference,Account,Event ID\r\n");
});

test("session and device secrets are omitted while account and non-session record references remain", () => {
  const tokenHash = "b".repeat(64);
  const rows = [row({ targetType: "member-session", targetId: tokenHash }),
    row({ targetType: "owner-session", targetId: tokenHash }),
    row({ targetType: "device", targetId: tokenHash }),
    row({ targetType: "settings", targetId: "1" })];
  for (const item of rows) assert.equal(auditReference(item), "");
  assert.equal(auditReference(row({ targetType: "owner-session", targetId: "admin" })), "Admin dashboard");
  assert.equal(auditReference(row({ targetType: "owner-session", targetId: "analytics" })), "Analytics dashboard");
  assert.equal(auditReference(row({ targetType: "plan", targetId: "plan-id" })), "plan-id");
  const csv = auditCsv(rows);
  assert.doesNotMatch(csv, new RegExp(tokenHash, "u"));
  assert.ok(csv.includes(accountId));
});
