import "server-only";

/** A verified code or an admin-issued temporary password grants this short reset-only authorization. */
export const passwordRecoveryRules = Object.freeze({ temporaryMs: 15 * 60_000, resetSessionMs: 15 * 60_000 });
