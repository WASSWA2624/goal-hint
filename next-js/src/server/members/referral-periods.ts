import "server-only";
import { scheduleRewardPeriods } from "../../domain/referrals.ts";
import type { Prisma } from "../generated/prisma/client.ts";

/** Caller holds the account lock. Keep rewards behind paid/trial access without rounding away unused time. */
export async function rechainRewardPeriods(tx: Prisma.TransactionClient, accountId: string, at: Date) {
  const periods = await tx.accessCode.findMany({ where: { accountId, revokedAt: null, endsAt: { gt: at } },
    include: { paymentSubmission: { select: { workflowVersion: true } } } });
  const checkoutStarts = periods.filter(row => row.paymentSubmission?.workflowVersion === 2).map(row => +row.startsAt);
  // Checkout appends after all existing access. Those earlier earned periods already form part of its starting expiry;
  // moving them behind it again would count their unused time twice during a later manual grant or renewal.
  const scheduled = periods.map(row => row.source === "referral" && checkoutStarts.some(start => start >= +row.endsAt)
    ? { ...row, source: "retained-reward" } : row);
  for (const period of scheduleRewardPeriods(scheduled, at)) {
    const old = periods.find(row => row.id === period.id)!;
    if (+old.startsAt !== +period.startsAt || +old.endsAt !== +period.endsAt) {
      await tx.accessCode.update({ where: { id: period.id }, data: { startsAt: period.startsAt, endsAt: period.endsAt } });
    }
  }
}
