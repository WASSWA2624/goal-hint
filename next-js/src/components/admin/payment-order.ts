import type { OwnerPayment } from "../../domain/owner-members";

export const paymentSortOptions = [
  { value: "queue", label: "Queue order" },
  { value: "oldest", label: "Oldest first" },
  { value: "newest", label: "Newest first" },
  { value: "amount", label: "Highest amount" },
  { value: "amount-lowest", label: "Lowest amount" },
  { value: "reference", label: "Reference · A–Z" },
  { value: "reference-desc", label: "Reference · Z–A" },
  { value: "transaction", label: "Transaction ID · A–Z" },
  { value: "transaction-desc", label: "Transaction ID · Z–A" },
  { value: "phone", label: "Phone · ascending" },
  { value: "phone-desc", label: "Phone · descending" },
  { value: "provider", label: "Provider · A–Z" },
  { value: "provider-desc", label: "Provider · Z–A" },
  { value: "package", label: "Package · A–Z" },
  { value: "package-desc", label: "Package · Z–A" },
  { value: "duration", label: "Shortest duration" },
  { value: "duration-desc", label: "Longest duration" },
] as const;

export type PaymentSort = typeof paymentSortOptions[number]["value"];

type SortValue = string | number | null;
type Comparator = (left: OwnerPayment, right: OwnerPayment) => number;
const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
const text = (value: string | null | undefined) => value?.trim() || null;
const number = (value: number | null) => value !== null && Number.isFinite(value) ? value : null;
const phone = (payment: OwnerPayment) => text(payment.payerPhone) || text(payment.accountPhone);

/** Missing values stay below known values in either direction; equal values keep queue order. */
function orderBy(read: (payment: OwnerPayment) => SortValue, direction: 1 | -1 = 1): Comparator {
  return (left, right) => {
    const a = read(left), b = read(right);
    if (a === null) return b === null ? 0 : 1;
    if (b === null) return -1;
    return direction * (typeof a === "number" && typeof b === "number" ? a - b : collator.compare(String(a), String(b)));
  };
}

const fields = {
  date: (payment: OwnerPayment) => number(Date.parse(payment.submittedAt)),
  amount: (payment: OwnerPayment) => number(payment.final?.amount ?? payment.amount),
  reference: (payment: OwnerPayment) => text(payment.reference),
  transaction: (payment: OwnerPayment) => text(payment.final?.transactionId) || text(payment.transactionId),
  phone: (payment: OwnerPayment) => phone(payment)?.replace(/\D/gu, "") || null,
  provider: (payment: OwnerPayment) => text(payment.final?.network) || text(payment.network),
  package: (payment: OwnerPayment) => payment.purpose === "topup" ? "Credit top-up" : text(payment.planName),
  duration: (payment: OwnerPayment) => number(payment.durationDays),
};
const comparators: Record<Exclude<PaymentSort, "queue">, Comparator> = {
  oldest: orderBy(fields.date), newest: orderBy(fields.date, -1),
  amount: orderBy(fields.amount, -1), "amount-lowest": orderBy(fields.amount),
  reference: orderBy(fields.reference), "reference-desc": orderBy(fields.reference, -1),
  transaction: orderBy(fields.transaction), "transaction-desc": orderBy(fields.transaction, -1),
  phone: orderBy(fields.phone), "phone-desc": orderBy(fields.phone, -1),
  provider: orderBy(fields.provider), "provider-desc": orderBy(fields.provider, -1),
  package: orderBy(fields.package), "package-desc": orderBy(fields.package, -1),
  duration: orderBy(fields.duration), "duration-desc": orderBy(fields.duration, -1),
};

/** Sort the loaded review window without changing the server queue or its payment objects. */
export function sortPayments<T extends OwnerPayment>(payments: readonly T[], sort: PaymentSort): T[] {
  const ordered = [...payments];
  return sort === "queue" ? ordered : ordered.sort(comparators[sort]);
}
