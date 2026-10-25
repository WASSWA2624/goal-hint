/** What the subscribe page is paying for right now, so the shared expiry bar can word itself for a top-up. */
export type PaymentPurpose = "plan" | "topup";

let purpose: PaymentPurpose | null = null;
const listeners = new Set<() => void>();

export function setPaymentPurpose(next: PaymentPurpose | null): void {
  if (purpose === next) return;
  purpose = next;
  for (const listener of listeners) listener();
}
export function subscribePaymentPurpose(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export const getPaymentPurpose = (): PaymentPurpose | null => purpose;
export const getServerPaymentPurpose = (): null => null;
