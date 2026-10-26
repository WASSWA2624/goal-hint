import { randomUUID } from "node:crypto";
import { hashPassword } from "../../src/server/analytics/analytics-password.ts";
import { createMemberSessions, issueMemberSession } from "../../src/server/members/member-sessions.ts";

let testHash;
/** Seed legacy authenticated rows for subscription/device-grant tests, including several sessions on one account.
 * This deliberately bypasses the one-device password-login policy; actual authentication is covered by member-auth tests. */
export function createAuthenticatedTestSessions({ database, config, now = Date.now }) {
  const sessions = createMemberSessions({ database, config, now });
  return { ...sessions, async signIn(phone, _address, previous) {
    testHash ??= hashPassword("synthetic member test password");
    const passwordHash = await testHash, at = new Date(now());
    return database.transaction(async (tx) => {
      await tx.$executeRaw`INSERT INTO MemberAccount (id, phone, passwordHash, phoneVerifiedAt, createdAt, lastSignInAt)
        VALUES (${randomUUID()}, ${phone}, ${passwordHash}, ${at}, ${at}, ${at}) ON DUPLICATE KEY UPDATE lastSignInAt = ${at}, passwordHash = ${passwordHash}, phoneVerifiedAt = ${at}`;
      const account = await tx.memberAccount.findUniqueOrThrow({ where: { phone } });
      const { token, session } = await issueMemberSession(tx, account.id, at, previous);
      await tx.memberSession.update({ where: { tokenHash: session.tokenHash }, data: { authenticatedAt: at } });
      return { status: "signed-in", token };
    }, { isolationLevel: "ReadCommitted" });
  } };
}
