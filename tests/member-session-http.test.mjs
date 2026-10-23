import assert from "node:assert/strict";
import test from "node:test";
import { createMemberSessionHandler } from "../src/server/members/member-auth-http.ts";

test("navigation session reports verified owner access privately, independently of a member phone", async () => {
  for (const phone of [null, "256700000001"]) {
    for (const signedIn of [false, true]) {
      const config = { production: false, cookies: { session: "owner-session" } };
      const handler = createMemberSessionHandler(
        async () => ({ config, sessions: { async verify() { return phone ? { phone } : null; } } }),
        async () => ({ config, database: null, auth: { async verify(token, options) {
          assert.equal(token, "opaque-owner-token");
          assert.deepEqual(options, { touch: false });
          return signedIn ? { username: "owner" } : null;
        } } }),
      );
      const response = await handler(new Request("http://localhost/api/account/session", {
        headers: { Cookie: "owner-session=opaque-owner-token" },
      }));
      assert.equal(response.status, 200);
      assert.match(response.headers.get("cache-control"), /no-store/);
      assert.deepEqual(await response.json(), { phone, administrator: signedIn });
    }
  }
});
