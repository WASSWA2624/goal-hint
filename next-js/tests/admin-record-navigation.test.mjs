import assert from "node:assert/strict";
import test from "node:test";
import { adminLandingPath, adminSections, isRecordAdminSection } from "../src/domain/admin-navigation.ts";

test("record workflows follow Payments, followed by other tools and separate Analytics", () => {
  assert.equal(adminLandingPath, "/admin/payments");
  assert.deepEqual(adminSections.map(item => item.key), ["overview", "payments", "codes", "subscribers", "plans", "audit", "settings", "forecasts", "analytics"]);
  assert.equal(new Set(adminSections.map(item => item.href)).size, adminSections.length);
});

test("only the five approved record screens use the fixed list/detail workspace", () => {
  assert.deepEqual(adminSections.filter(item => isRecordAdminSection(item.key)).map(item => item.key), ["payments", "codes", "subscribers", "plans", "audit"]);
  for (const key of ["overview", "settings", "forecasts", "analytics"]) assert.equal(isRecordAdminSection(key), false);
});
