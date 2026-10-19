/** Only an English feed or a canonical match path can be a member return destination. No queries, fragments or escapes. */
export function memberReturnPath(value: unknown): string | null {
  return typeof value === "string" && value.length <= 512 && (value === "/en" || /^\/en\/matches\/[A-Za-z0-9_-]+\/[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value)) ? value : null;
}

export const paymentDraftStorageKey = "goal-hint-payment-draft:v1";

export function memberNextPath(destination: unknown, returnTo: unknown, status?: string): string {
  const query = new URLSearchParams();
  const safeReturn = memberReturnPath(returnTo);
  if (safeReturn) query.set("return", safeReturn);
  if (status) query.set("status", status);
  return `/en/${destination === "subscribe" ? "subscribe" : "account"}${query.size ? `?${query}` : ""}`;
}
