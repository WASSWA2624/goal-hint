import "server-only";
import { scheduleRewardPeriods } from "../../domain/referrals.ts";
import type { Prisma } from "../generated/prisma/client.ts";

/** Caller holds the account lock. Keep rewards behind paid/trial access without rounding away unused time. */
export async function rechainRewardPeriods(tx: Prisma.TransactionClient, accountId: string, at: Date) {
  const periods = await tx.accessCode.findMany({ where: { accountId, revokedAt: null, endsAt: { gt: at } } });
  for (const period of scheduleRewardPeriods(periods, at)) {
    const old = periods.find(row => row.id === period.id)!;
    if (+old.startsAt !== +period.startsAt || +old.endsAt !== +period.endsAt) {
      await tx.accessCode.update({ where: { id: period.id }, data: { startsAt: period.startsAt, endsAt: period.endsAt } });
    }
  }
}
