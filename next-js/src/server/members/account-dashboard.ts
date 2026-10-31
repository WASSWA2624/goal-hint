import "server-only";

import { accountActivityLimit, type AccountActivity, type AccountDashboard } from "../../domain/account-dashboard.ts";
import { formatPaymentReference } from "../../domain/payment.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import type { MemberIdentity } from "./member-sessions.ts";

const paymentStatuses = ["pending", "superseded", "approved", "rejected", "reversed"] as const;
const paymentSelect = { id: true, reference: true, purpose: true, planName: true, status: true,
  submittedAt: true, decidedAt: true, reversedAt: true } satisfies Prisma.PaymentSubmissionSelect;
const accessSelect = { id: true, planName: true, createdAt: true, startsAt: true, endsAt: true, revokedAt: true } satisfies Prisma.AccessCodeSelect;

/** Readable even after subscription expiry or sales close; paid-device unlock is not account authentication. */
export function createAccountDashboard({ database, now = Date.now }: { database: DatabaseRuntime; now?: () => number }) {
  return Object.freeze({
    async read(member: MemberIdentity): Promise<AccountDashboard | null> {
      if (member.blocked) return null;
      return database.transaction(async tx => {
        const at = new Date(now());
        const session = await tx.memberSession.findUnique({ where: { tokenHash: member.tokenHash }, select: {
          accountId: true, authenticatedAt: true, passwordResetAt: true, expiresAt: true,
          account: { select: { phone: true, passwordHash: true, phoneVerifiedAt: true, blockedAt: true, erasedAt: true } },
        } });
        if (!session || session.accountId !== member.accountId || !session.authenticatedAt || session.passwordResetAt || session.expiresAt <= at
          || session.account.blockedAt || session.account.erasedAt || !session.account.phone || session.account.phone !== member.phone
          || !session.account.passwordHash || !session.account.phoneVerifiedAt) return null;

        const accountId = member.accountId;
        // Separate bounded reads by each event time include old reports decided/reversed recently.
        // A single lexicographic order by nullable dates would hide newer submissions behind older reversals.
        const [active, paymentGroups, accessGroups, rewards] = await Promise.all([
          tx.accessCode.findFirst({ where: { accountId, revokedAt: null, startsAt: { lte: at }, endsAt: { gt: at } },
            orderBy: [{ startsAt: "desc" }, { id: "desc" }], select: { planName: true } }),
          Promise.all((["submittedAt", "decidedAt", "reversedAt"] as const).map(field => tx.paymentSubmission.findMany({
            where: { accountId, status: { in: [...paymentStatuses] }, [field]: { lte: at } },
            orderBy: [{ [field]: "desc" }, { id: "desc" }], take: accountActivityLimit, select: paymentSelect,
          }))),
          Promise.all((["createdAt", "revokedAt"] as const).map(field => tx.accessCode.findMany({
            where: { accountId, source: { not: "referral" }, [field]: { lte: at } }, orderBy: [{ [field]: "desc" }, { id: "desc" }],
            take: accountActivityLimit, select: accessSelect,
          }))),
          tx.memberReferral.findMany({ where: { inviterId: accountId, status: "rewarded", rewardedAt: { lte: at } },
            orderBy: [{ rewardedAt: "desc" }, { id: "desc" }], take: accountActivityLimit, select: { id: true, rewardedAt: true } }),
        ]);
        const activity = new Map<string, AccountActivity>();
        for (const row of paymentGroups.flat()) {
          const date = row.status === "reversed" ? row.reversedAt : row.status === "pending" ? row.submittedAt : row.decidedAt;
          // With no recorded decision time, retain the submitted event rather than inventing one.
          const eventAt = date ?? row.submittedAt;
          if (eventAt > at) continue;
          const id = `payment:${row.id}`;
          activity.set(id, { id, kind: "payment", status: date ? row.status as typeof paymentStatuses[number] : "pending",
            planName: row.planName, reference: formatPaymentReference(row.reference), purpose: row.purpose === "topup" ? "topup" : "plan", at: eventAt.toISOString() });
        }
        for (const row of accessGroups.flat()) {
          const removed = !!row.revokedAt && row.revokedAt <= at, eventAt = removed ? row.revokedAt! : row.createdAt;
          if (eventAt > at) continue;
          const id = `access:${row.id}`;
          activity.set(id, { id, kind: "access", status: removed ? "removed" : "added", planName: row.planName,
            startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString(), at: eventAt.toISOString() });
        }
        for (const row of rewards) if (row.rewardedAt) {
          const id = `referral:${row.id}`;
          activity.set(id, { id, kind: "referral", status: "rewarded", planName: "Earned access", at: row.rewardedAt.toISOString() });
        }
        return { activePlanName: active?.planName ?? null, activity: [...activity.values()]
          .sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id)).slice(0, accountActivityLimit) };
      }, { isolationLevel: "RepeatableRead", timeout: 10_000 });
    },
  });
}
export type AccountDashboardService = ReturnType<typeof createAccountDashboard>;
