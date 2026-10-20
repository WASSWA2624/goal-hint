import { randomUUID } from "node:crypto";
import { hashPassword } from "../../src/server/analytics/analytics-password.ts";
import { createMemberSessions, issueMemberSession } from "../../src/server/members/member-sessions.ts";

let testHash;
/** Explicitly seed authenticated identities for subscription tests; actual login/SMS is covered by member-auth tests. */
export function createAuthenticatedTestSessions({ database, config, now = Date.now }) {
  const sessions = createMemberSessions({ database, config, now });
  return { ...sessions, async signIn(phone, _address, previous) {
    testHash ??= hashPassword("synthetic member test password");
    const passwordHash = await testHash, at = new Date(now());
    return database.transaction(async (tx) => {
      await tx.$executeRaw`INSERT INTO MemberAccount (id, phone, passwordHash, createdAt, lastSignInAt)
        VALUES (${randomUUID()}, ${phone}, ${passwordHash}, ${at}, ${at}) ON DUPLICATE KEY UPDATE lastSignInAt = ${at}, passwordHash = ${passwordHash}`;
      const account = await tx.memberAccount.findUniqueOrThrow({ where: { phone } });
      const { token } = await issueMemberSession(tx, account.id, at, previous, true);
      return { status: "signed-in", token };
    }, { isolationLevel: "ReadCommitted" });
  } };
}
