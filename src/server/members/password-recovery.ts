import "server-only";

/** An admin reads the generated password to the member; no delivery integration is involved. */
export const passwordRecoveryRules = Object.freeze({ temporaryMs: 15 * 60_000, resetSessionMs: 15 * 60_000 });
