import { createHmac } from "node:crypto";

export const fixtureAdminPhone = "256700000991", fixtureAdminPassword = "Synthetic admin password";
export const fixtureKey = (purpose: string, value: string) => createHmac("sha256", "synthetic-member-fixture-key")
  .update(`${purpose}\0${value}`).digest("hex");
export const fixtureTokens = { pending: "v".repeat(43), reset: "r".repeat(43), authenticated: "a".repeat(43),
  administrator: "d".repeat(43), blocked: "b".repeat(43), erased: "e".repeat(43), expired: "x".repeat(43), stale: "s".repeat(43), owner: "o".repeat(43) };
