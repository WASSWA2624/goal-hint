export const paymentStatusLabels = {
  pending: "Pending",
  remaining: "Part-paid",
  disputed: "Disputed",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
  reconciliation: "Unallocated funds",
} as const;

const legacyStatusLabels = { correction: "Correction requested", reconfirm: "Confirmation required", superseded: "Replaced report" } as const;
export const paymentQueueStatusLabels = { ...paymentStatusLabels, ...legacyStatusLabels };
export const paymentProviderLabels = { mtn: "MTN MoMo", airtel: "Airtel Money" } as const;

export type PaymentQueueStatus = keyof typeof paymentQueueStatusLabels;
export type PaymentProvider = keyof typeof paymentProviderLabels;
export type PaymentFilters = Readonly<{
  statuses: readonly ("all" | PaymentQueueStatus)[];
  providers: readonly ("all" | PaymentProvider)[];
}>;

export const defaultPaymentFilters: PaymentFilters = { statuses: ["pending"], providers: ["all"] };

function readChoices<T extends string>(value: unknown, labels: Record<T, string>, fallback: readonly (T | "all")[]): readonly (T | "all")[] {
  if (typeof value !== "string") return fallback;
  const values = new Set(value.split(","));
  if (values.has("all")) return ["all"];
  const selected = (Object.keys(labels) as T[]).filter(key => values.has(key));
  return selected.length ? selected : fallback;
}

export function readPaymentFilters(status: unknown, provider: unknown, legacyTab?: unknown): PaymentFilters {
  return {
    statuses: readChoices(status ?? legacyTab, paymentQueueStatusLabels, defaultPaymentFilters.statuses),
    providers: readChoices(provider, paymentProviderLabels, defaultPaymentFilters.providers),
  };
}
