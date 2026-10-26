import { createHmac } from "node:crypto";
import { memberTokenHash } from "../../src/server/members/member-sessions.ts";

export const fixtureAdminPhone = "256700000991", fixtureAdminPassword = "Synthetic admin fixture password";
export const fixtureAdminKey = (purpose, value) => createHmac("sha256", "synthetic-admin-fixture-key").update(`${purpose}\0${value}`).digest("hex");
export function installAdminFixtureEnvironment() {
  const values = { GOAL_HINT_ADMIN_PHONES: JSON.stringify([fixtureAdminPhone]), GOAL_HINT_ADMIN_PASSWORD: fixtureAdminPassword, GOAL_HINT_ADMIN_PASSWORD_HASH: "" };
  const previous = new Map(Object.keys(values).map(name => [name, process.env[name]]));
  Object.assign(process.env, values);
  return () => { for (const [name, value] of previous) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } };
}

/** Storage rows only: production member-session verification and dashboard authorization still make every decision. */
export function fixtureAdminSessions({ token, key = fixtureAdminKey, available = () => true, read = () => {}, remove = () => {}, accountId = "00000000-0000-4000-8000-000000000991" }) {
  return {
    async findUnique({ where }) {
      read(where.tokenHash);
      if (!available() || where.tokenHash !== memberTokenHash(token)) return null;
      const at = new Date();
      return { tokenHash: where.tokenHash, accountId, authenticatedAt: at, passwordResetAt: null, lastSeenAt: at, createdAt: at,
        expiresAt: new Date(+at + 86_400_000), codeEnteredAt: null, accessCodeId: null,
        adminPasswordVersion: key("admin-password-version", `plain:${fixtureAdminPassword}`),
        account: { id: accountId, phone: fixtureAdminPhone, passwordHash: null, phoneVerifiedAt: at, blockedAt: null, erasedAt: null } };
    },
    async updateMany() { return { count: 0 }; },
    async deleteMany({ where }) { remove(where.tokenHash); return { count: 1 }; },
  };
}
