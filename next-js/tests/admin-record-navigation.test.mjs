import assert from "node:assert/strict";
import test from "node:test";
import { adminLandingPath, adminSections, isRecordAdminSection } from "../src/domain/admin-navigation.ts";

test("administrator entry opens Overview while record tools keep their dedicated routes", () => {
  assert.equal(adminLandingPath, "/admin");
  assert.equal(adminSections.find(item => item.key === "payments").href, "/admin/payments");
  assert.deepEqual(adminSections.map(item => item.key), ["overview", "payments", "codes", "subscribers", "referrals", "plans", "audit", "settings", "analytics"]);
  assert.equal(new Set(adminSections.map(item => item.href)).size, adminSections.length);
});

test("record screens and Settings use the fixed list/detail workspace", () => {
  assert.deepEqual(adminSections.filter(item => isRecordAdminSection(item.key)).map(item => item.key), ["payments", "codes", "subscribers", "referrals", "plans", "audit", "settings"]);
  for (const key of ["overview", "analytics"]) assert.equal(isRecordAdminSection(key), false);
});
