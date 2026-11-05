import "server-only";

import { createHash } from "node:crypto";
import type { DatabaseRuntime } from "../database/client.ts";
import { hashPassword } from "../analytics/analytics-password.ts";
import { memberSessionRules } from "../members/member-sessions.ts";
import { demoMember, assertDemoDatabase } from "./member.ts";

let passwordHash: Promise<string> | undefined;

/** Bootstrap a normal sign-in identity without manufacturing paid access or account credit. */
export async function seedDemoMember(database: DatabaseRuntime, nowMs = Date.now()): Promise<void> {
  assertDemoDatabase();
  const at = new Date(nowMs), startsAt = new Date(nowMs - 86_400_000), expiresAt = new Date(nowMs + memberSessionRules.expiryMs);
  const password = await (passwordHash ??= hashPassword(demoMember.password));
  const tokenHash = createHash("sha256").update(demoMember.token).digest("hex");
  await database.transaction(async (tx) => {
    const existingAccount = await tx.memberAccount.findUnique({ where: { id: demoMember.accountId }, select: { id: true } });
    await tx.subscriptionSettings.upsert({ where: { id: 1 }, update: {}, create: {
      id: 1, paywallMode: "on", updatedAt: at, updatedBy: "development-demo",
      mtnEnabled: true, mtnNumber: "256700000080", mtnName: "Goal Hint Demo MTN",
      airtelEnabled: true, airtelNumber: "256700000081", airtelName: "Goal Hint Demo Airtel",
      contactPhone: "256700000082", whatsappPhone: "256700000082", reviewTime: "Within 5 minutes (demo)",
      paymentNote: "Synthetic development subscription. No payment is required.",
    } });
    await tx.memberAccount.upsert({ where: { id: demoMember.accountId }, update: {}, create: {
      id: demoMember.accountId, phone: demoMember.phone, passwordHash: password,
      phoneVerifiedAt: at, passwordChangedAt: startsAt, createdAt: startsAt, lastSignInAt: at,
      ownerNote: "Synthetic development member", creditUgx: 0,
    } });
    const session = await tx.memberSession.findUnique({ where: { tokenHash }, select: { expiresAt: true } });
    if (session && session.expiresAt <= at) {
      await tx.memberSession.updateMany({ where: { tokenHash, expiresAt: { lte: at } }, data: { expiresAt } });
    } else if (!session && !existingAccount) {
      // Bootstrap once; later catalog reads must respect deletion by sign-out.
      await tx.memberSession.create({ data: {
        tokenHash, accountId: demoMember.accountId, createdAt: startsAt, lastSeenAt: at,
        expiresAt, authenticatedAt: startsAt,
      } });
    }
  }, { isolationLevel: "ReadCommitted", timeout: 10_000 });
}
