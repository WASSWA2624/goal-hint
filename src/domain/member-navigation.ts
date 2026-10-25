/** One phone-and-password sign-in page for every account role. */
export const memberLoginPath = "/en/account?view=login";
/** Owner decision (2026-10-25): signing out, as a member or the owner, keeps you browsing the matches with the same
 * free-tier limits as a visitor, never on the sign-in form. */
export const signedOutPath = "/en/matches";

/** Only an English feed or a canonical match path can be a member return destination. No queries, fragments or escapes. */
export function memberReturnPath(value: unknown): string | null {
  return typeof value === "string" && value.length <= 512 && (["/en", "/en/matches", "/en/slips"].includes(value) || /^\/en\/matches\/[A-Za-z0-9_-]+\/[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value)) ? value : null;
}

/** Every draft version shares the prefix, so sign-out also clears a draft an older release left in the tab. */
export const paymentDraftStoragePrefix = "goal-hint-payment-draft:";
export const paymentDraftStorageKey = `${paymentDraftStoragePrefix}v2`;

export function memberNextPath(destination: unknown, returnTo: unknown, status?: string): string {
  const query = new URLSearchParams();
  const safeReturn = memberReturnPath(returnTo);
  if (safeReturn) query.set("return", safeReturn);
  if (status) query.set("status", status);
  return `/en/${destination === "subscribe" ? "subscribe" : "account"}${query.size ? `?${query}` : ""}`;
}
