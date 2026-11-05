import assert from "node:assert/strict";
import test from "node:test";
import { readMemberPageSession } from "../src/server/members/member-page-session.ts";

const phone = "256700000101";
function source({ member = null, reset = null, verification = null } = {}) {
  return { sessions: { async verify() { return member; } }, auth: {
    async passwordResetSession() { return reset; }, async verificationSession() { return verification; },
  } };
}

test("private pages distinguish guests, verified, blocked and restricted sessions without subscription settings", async () => {
  for (const token of [undefined, "expired", "revoked"]) assert.deepEqual(await readMemberPageSession(source(), token), { kind: "guest" });
  for (const member of [{ phone }, { phone, blocked: true }, { phone, administrator: true }]) {
    const services = source({ member });
    services.auth.passwordResetSession = services.auth.verificationSession = async () => { throw new Error("A verified identity needs no restricted-session reads"); };
    assert.deepEqual(await readMemberPageSession(services, "valid"), { kind: "member", member });
  }
  assert.deepEqual(await readMemberPageSession(source({ verification: { phone } }), "pending"), { kind: "verification", phone });
  assert.deepEqual(await readMemberPageSession(source({ reset: { phone } }), "reset"), { kind: "reset", phone });
});

test("failed identity or restricted-session reads never fall through to guest authentication", async () => {
  assert.deepEqual(await readMemberPageSession({ sessions: null }), { kind: "unavailable" });
  for (const task of ["verify", "passwordResetSession", "verificationSession"]) {
    const services = source();
    (task === "verify" ? services.sessions : services.auth)[task] = async () => { throw new Error("storage unavailable"); };
    assert.deepEqual(await readMemberPageSession(services, "existing-cookie"), { kind: "unavailable" });
  }
});
