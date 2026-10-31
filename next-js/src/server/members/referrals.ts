import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { referralRules, remainingRewardMs, validReferralCode, type ReferralSummary } from "../../domain/referrals.ts";
import type { AnalyticsConfig } from "../analytics/analytics-config.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import type { MemberAccount, Prisma } from "../generated/prisma/client.ts";
import { accessCodeTransaction, createAccessPeriod, lockMemberAccount } from "./access-codes.ts";
import { unlockedDeviceLimit } from "./device-grants.ts";
import { isMemberAdminPhone } from "./member-admin.ts";
import type { MemberIdentity } from "./member-sessions.ts";

type Key = Pick<AnalyticsConfig, "key">;
const phoneKey = (config: Key, phone: string) => config.key("referral-registration-phone", phone);
export const newReferralCode = () => randomBytes(16).toString("hex");
/** Caller holds the account lock; existing invitation links must never change. */
async function ensureReferralCode(tx: Prisma.TransactionClient, account: Pick<MemberAccount, "id" | "referralCode">) {
  if (account.referralCode) return account.referralCode;
  const code = newReferralCode();
  await tx.memberAccount.update({ where: { id: account.id }, data: { referralCode: code } });
  return code;
}
function eligibleInviter(account: MemberAccount | null): account is MemberAccount & { phone: string } {
  return !!account?.phone && !!account.passwordHash && !!account.phoneVerifiedAt && !account.blockedAt && !account.erasedAt && !isMemberAdminPhone(account.phone);
}

/** Keep only a keyed identity when an existing number is verified, erased or permanently deleted. */
export async function rememberRegistrationPhone(tx: Prisma.TransactionClient, config: Key, phone: string, at: Date) {
  const key = phoneKey(config, phone);
  if (!await tx.memberReferral.findUnique({ where: { phoneKey: key } }))
    await tx.memberReferral.create({ data: { id: randomUUID(), phoneKey: key, registeredAt: at, status: "ineligible" } });
}

/** Called only by new-account registration, never login or phone changes. A prior phone identity cannot earn again. */
export async function recordReferralRegistration(tx: Prisma.TransactionClient, config: Key, account: { id: string; phone: string | null }, at: Date, code?: string | null) {
  if (!account.phone) return;
  const key = phoneKey(config, account.phone);
  if (await tx.memberReferral.findUnique({ where: { phoneKey: key } })) return;
  const inviter = validReferralCode(code) ? await tx.memberAccount.findUnique({ where: { referralCode: code } }) : null;
  const inviterId = eligibleInviter(inviter) && inviter.id !== account.id && inviter.phone !== account.phone ? inviter.id : null;
  await tx.memberReferral.create({ data: { id: randomUUID(), phoneKey: key, accountId: account.id, inviterId,
    registeredAt: at, status: inviterId ? "pending" : "ineligible" } });
}

/** Caller holds the invitee account lock. A successful first verification and its one award commit together. */
export async function awardReferralRegistration(tx: Prisma.TransactionClient, config: Key, account: { id: string; phone: string | null }, at: Date) {
  const registration = await tx.memberReferral.findUnique({ where: { accountId: account.id } });
  if (!registration || registration.status !== "pending") return;
  const inviter = registration.inviterId && registration.inviterId !== account.id ? await lockMemberAccount(tx, registration.inviterId) : null;
  if (!eligibleInviter(inviter) || !account.phone || registration.phoneKey !== phoneKey(config, account.phone) || inviter.phone === account.phone) {
    await tx.memberReferral.update({ where: { id: registration.id }, data: { status: "ineligible" } });
    return;
  }
  const grant = await createAccessPeriod(tx, inviter, { source: "referral", planName: "Earned access", durationDays: 1,
    priceUgx: 0, amountReceivedUgx: 0 }, "system:referral", at, { maximum: await unlockedDeviceLimit(tx) });
  await tx.memberReferral.update({ where: { id: registration.id }, data: { status: "rewarded", rewardedAt: at, accessCodeId: grant.id } });
}

export function createReferrals({ database, now = Date.now }: { database: DatabaseRuntime; now?: () => number }) {
  return Object.freeze({
    /** Operator-only, bounded and rerunnable. Provisioning a code never grants eligibility or rewards. */
    async provisionCodes(apply = false) {
      let cursor: string | undefined, missing = 0, created = 0, skipped = 0;
      while (true) {
        const accounts = await database.query(tx => tx.memberAccount.findMany({
          where: { referralCode: null, phone: { not: null }, passwordHash: { not: null }, erasedAt: null,
            ...(cursor ? { id: { gt: cursor } } : {}) },
          orderBy: { id: "asc" }, take: 100, select: { id: true, phone: true },
        }));
        if (!accounts.length) break;
        for (const row of accounts) {
          if (isMemberAdminPhone(row.phone)) { skipped++; continue; }
          missing++;
          if (apply) created += await accessCodeTransaction(database, async tx => {
            const account = await lockMemberAccount(tx, row.id);
            if (!account?.phone || !account.passwordHash || account.erasedAt || account.referralCode || isMemberAdminPhone(account.phone)) return 0;
            await ensureReferralCode(tx, account);
            return 1;
          });
        }
        cursor = accounts.at(-1)!.id;
      }
      return { missing, created, skipped, applied: apply };
    },
    async inviter(code: string): Promise<boolean> {
      if (!validReferralCode(code)) return false;
      return database.query(async tx => eligibleInviter(await tx.memberAccount.findUnique({ where: { referralCode: code } })));
    },
    async read(member: MemberIdentity): Promise<ReferralSummary | null> {
      if (member.blocked || member.administrator) return null;
      return accessCodeTransaction(database, async tx => {
        const at = new Date(now()), account = await lockMemberAccount(tx, member.accountId);
        const session = await tx.memberSession.findUnique({ where: { tokenHash: member.tokenHash } });
        if (!eligibleInviter(account) || account.phone !== member.phone || !session?.authenticatedAt || session.passwordResetAt
          || session.accountId !== member.accountId || session.expiresAt <= at) return null;
        const code = await ensureReferralCode(tx, account);
        const [verified, history, periods] = await Promise.all([
          tx.memberReferral.count({ where: { inviterId: member.accountId, status: "rewarded" } }),
          tx.memberReferral.findMany({ where: { inviterId: member.accountId }, orderBy: [{ registeredAt: "desc" }, { id: "desc" }], take: referralRules.historyLimit,
            select: { id: true, registeredAt: true, rewardedAt: true, status: true } }),
          tx.accessCode.findMany({ where: { accountId: member.accountId, source: "referral", revokedAt: null, endsAt: { gt: at } },
            select: { startsAt: true, endsAt: true, source: true, revokedAt: true } }),
        ]);
        return { code, verified, earnedDays: verified, remainingMs: remainingRewardMs(periods, at), history: history.map(row => ({
          id: row.id, registeredAt: row.registeredAt.toISOString(), rewardedAt: row.rewardedAt?.toISOString() ?? null,
          status: row.status === "rewarded" ? "rewarded" as const : row.status === "pending" ? "pending" as const : "ineligible" as const,
        })) };
      });
    },
  });
}
export type ReferralsService = ReturnType<typeof createReferrals>;
