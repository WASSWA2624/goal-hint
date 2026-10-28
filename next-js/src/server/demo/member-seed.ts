import "server-only";

import { createHash } from "node:crypto";
import type { DatabaseRuntime } from "../database/client.ts";
import { hashPassword } from "../analytics/analytics-password.ts";
import { appendWalletEntry } from "../members/wallet.ts";
import { hashCode } from "../members/access-codes.ts";
import { demoMember, assertDemoDatabase } from "./member.ts";

let passwordHash: Promise<string> | undefined;

/** Uses the production account/session/access records; no entitlement bypass is installed. */
export async function seedDemoMember(database: DatabaseRuntime, nowMs = Date.now()): Promise<void> {
  assertDemoDatabase();
  const at = new Date(nowMs), startsAt = new Date(nowMs - 86_400_000), endsAt = new Date(nowMs + 365 * 86_400_000);
  const password = await (passwordHash ??= hashPassword(demoMember.password));
  const tokenHash = createHash("sha256").update(demoMember.token).digest("hex");
  const codeSalt = new Uint8Array(16), codeHash = hashCode(codeSalt, demoMember.accessCode);
  await database.transaction(async (tx) => {
    const existingAccount = await tx.memberAccount.findUnique({ where: { id: demoMember.accountId }, select: { id: true } });
    await tx.subscriptionSettings.upsert({ where: { id: 1 }, update: {}, create: {
      id: 1, paywallMode: "on", updatedAt: at, updatedBy: "development-demo",
      mtnNumber: "256700000080", mtnName: "Goal Hint Demo MTN",
      airtelNumber: "256700000081", airtelName: "Goal Hint Demo Airtel",
      contactPhone: "256700000082", whatsappPhone: "256700000082", reviewTime: "Within 5 minutes (demo)",
      paymentNote: "Synthetic development subscription. No payment is required.",
    } });
    await tx.subscriptionPlan.upsert({ where: { id: demoMember.planId }, update: {}, create: {
      id: demoMember.planId, name: "Demo annual access", durationDays: 366, priceUgx: 10000,
      active: true, sortOrder: 0, createdAt: at, updatedAt: at,
    } });
    await tx.memberAccount.upsert({ where: { id: demoMember.accountId }, update: {}, create: {
      id: demoMember.accountId, phone: demoMember.phone, passwordHash: password,
      phoneVerifiedAt: at, passwordChangedAt: startsAt, createdAt: startsAt, lastSignInAt: at,
      ownerNote: "Synthetic development member", creditUgx: 0,
    } });
    if (await tx.walletEntry.count({ where: { accountId: demoMember.accountId } }) === 0) {
      await tx.memberAccount.update({ where: { id: demoMember.accountId }, data: { creditUgx: 0 } });
      await appendWalletEntry(tx, demoMember.accountId, { kind: "adjustment", amountUgx: 100000,
        actor: "admin", at: startsAt, note: "Synthetic development starting credit", requestKey: "development-demo-initial-credit" });
    }
    const existingAccess = await tx.accessCode.findUnique({ where: { id: demoMember.accessCodeId }, select: { endsAt: true } });
    const access = await tx.accessCode.upsert({ where: { id: demoMember.accessCodeId },
      update: existingAccess && existingAccess.endsAt > at ? { codeSalt, codeHash } : { startsAt, endsAt, codeSalt, codeHash }, create: {
      id: demoMember.accessCodeId, accountId: demoMember.accountId,
      codeSalt, codeHash,
      reference: "DM01", source: "manual", planId: demoMember.planId, planName: "Demo annual access",
      durationDays: 366, priceUgx: 0, amountReceivedUgx: 0, createdAt: startsAt,
      createdBy: "development-demo", activatedAt: startsAt, startsAt, endsAt,
      note: "Synthetic development access; no external payment.",
    }, select: { endsAt: true } });
    const session = await tx.memberSession.findUnique({ where: { tokenHash }, select: { expiresAt: true } });
    if (session && session.expiresAt <= at) {
      await tx.memberSession.updateMany({ where: { tokenHash, expiresAt: { lte: at } }, data: { expiresAt: access.endsAt } });
    } else if (!session && !existingAccount) {
      // Bootstrap once; later catalog reads must respect deletion by sign-out.
      await tx.memberSession.create({ data: {
        tokenHash, accountId: demoMember.accountId, createdAt: startsAt, lastSeenAt: at,
        expiresAt: access.endsAt, authenticatedAt: startsAt, codeEnteredAt: startsAt, accessCodeId: demoMember.accessCodeId,
      } });
    }
  }, { isolationLevel: "ReadCommitted", timeout: 10_000 });
}
