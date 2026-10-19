/** Explicitly preserve full-content expectations in pre-paywall tests and rendering fixtures. */
export const fullAccess = async () => ({ tier: "full", signedIn: false, mode: "off" } as const);
