import "server-only";

import type { Prisma } from "../generated/prisma/client.ts";

/**
 * The one definition of counted revenue, shared by the Overview and the Profit page so their totals cannot diverge: approved
 * payments that were not reversed, both subscriber reports and owner-recorded payments (credit top-ups included), at the
 * moment they were approved; plus the amounts the owner recorded with a manual access period (no network), when it was
 * created. Trials, reissues and number changes carry no amount. Revenue is cash: spending credit is never counted again.
 */
export type RevenueRange = Readonly<{ gte: Date; lte?: Date; lt?: Date }>;

export function countedPaymentWhere(range: RevenueRange) {
  return { status: "approved", reversedAt: null, decidedAt: range } as const satisfies Prisma.PaymentSubmissionWhereInput;
}

export function countedManualWhere(range: RevenueRange) {
  return { source: "manual", createdAt: range } as const satisfies Prisma.AccessCodeWhereInput;
}
