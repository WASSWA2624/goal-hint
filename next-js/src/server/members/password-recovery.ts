import "server-only";

/** A verified recovery code grants this short reset-only authorization. */
export const passwordRecoveryRules = Object.freeze({ resetSessionMs: 15 * 60_000 });
