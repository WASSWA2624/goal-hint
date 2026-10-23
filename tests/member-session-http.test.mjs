import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createMemberSessionHandler } from "../src/server/members/member-auth-http.ts";
import { fixtureAdminPhone, installAdminFixtureEnvironment } from "./helpers/admin-fixtures.mjs";

after(installAdminFixtureEnvironment());
const token = "m".repeat(43);
test("navigation role and phone come from the same verified member, ignoring legacy owner cookies", async () => {
  const cases = [[null, false], [{ phone: "256700000101" }, false], [{ phone: "256700000101", administrator: true }, false],
    [{ phone: fixtureAdminPhone }, false], [{ phone: fixtureAdminPhone, administrator: true }, true],
    [{ phone: fixtureAdminPhone, administrator: true, blocked: true }, false]];
  for (const [member, administrator] of cases) for (const owner of ["", "; owner-session=opaque-owner-token"]) {
    const handler = createMemberSessionHandler(async () => ({ config: { production: false }, sessions: { async verify(value) {
      assert.equal(value, token); return member;
    } } }));
    const response = await handler(new Request("http://localhost/api/account/session", { headers: { Cookie: `goal-hint-member=${token}${owner}` } }));
    assert.equal(response.status, 200); assert.match(response.headers.get("cache-control"), /no-store/u);
    assert.deepEqual(await response.json(), { phone: member?.phone ?? null, administrator });
  }
});

test("navigation role fails closed when member storage is unavailable", async () => {
  const response = await createMemberSessionHandler(async () => ({ config: { production: false }, sessions: { async verify() { throw new Error("storage unavailable"); } } }))(
    new Request("http://localhost/api/account/session", { headers: { Cookie: "owner-session=opaque-owner-token" } }));
  assert.equal(response.status, 503); assert.deepEqual(await response.json(), { phone: null, error: "unavailable" });
});
