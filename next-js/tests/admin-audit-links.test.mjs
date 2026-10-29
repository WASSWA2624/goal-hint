import assert from "node:assert/strict";
import test from "node:test";
import { auditEventLink } from "../src/domain/admin-audit-links.ts";

const accountId = "11111111-1111-4111-8111-111111111111";
const targetId = "22222222-2222-4222-8222-222222222222";
const event = (overrides = {}) => ({ id: "1", at: "2026-10-29T09:00:00Z", actor: "owner", action: "payment_approved", accountId, targetType: "payment", targetId, ...overrides });

test("payment events open the exact report before considering its subscriber", () => {
  assert.deepEqual(auditEventLink(event()), { href: `/admin/payments?paymentId=${targetId}#${targetId}`, label: "View payment" });
  assert.deepEqual(auditEventLink(event({ accountId: null })), auditEventLink(event()));
});

test("plan records open that plan, while a reorder opens the plan directory", () => {
  assert.deepEqual(auditEventLink(event({ targetType: "plan", action: "plan_updated" })), { href: `/admin/plans?planId=${targetId}`, label: "View plan" });
  assert.deepEqual(auditEventLink(event({ targetType: "plan", targetId: "order", action: "plans_reordered" })), { href: "/admin/plans", label: "View plans" });
  assert.equal(auditEventLink(event({ targetType: "plan", targetId: "missing", action: "plan_updated" })), null);
});

test("account and access events select their subscriber, including historical member targets", () => {
  for (const targetType of ["member", "member-session", "access-code"]) {
    assert.deepEqual(auditEventLink(event({ targetType })), { href: `/admin/subscribers?accountId=${accountId}`, label: "View subscriber" });
  }
  assert.deepEqual(auditEventLink(event({ accountId: null, targetType: "member" })), { href: `/admin/subscribers?accountId=${targetId}`, label: "View subscriber" });
});

test("settings open settings and unsupported or invalid identifiers never become record links", () => {
  assert.deepEqual(auditEventLink(event({ targetType: "settings", targetId: "1" })), { href: "/admin/settings", label: "Open settings" });
  assert.equal(auditEventLink(event({ targetType: "owner-session", targetId: "admin" })), null);
  assert.equal(auditEventLink(event({ action: "uploads_busy", targetId: "daily-upload-ceiling", accountId: null })), null);
  assert.equal(auditEventLink(event({ targetType: "member", targetId: "javascript:alert(1)", accountId: "/unsafe" })), null);
});
