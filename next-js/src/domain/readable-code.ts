import type { BuiltSlip } from "./slip-builder.ts";

/** Public references are strings so leading zeros survive every transport. */
export const readableCodePattern = /^[0-9]{8}$/u;
export const readableCodeLimit = 99_999_999;
export function formatSlipNumber(value: number | bigint): string {
  const number = typeof value === "bigint" ? Number(value) : value;
  if (!Number.isSafeInteger(number) || number < 1 || number > readableCodeLimit) throw new RangeError("Slip number capacity exceeded.");
  return String(number).padStart(8, "0");
}

/** Snapshot identity is deterministic across browsers and the server; progress never changes a reference. */
export async function slipNumberFingerprint(slip: { id: string; selections?: BuiltSlip["selections"]; totalOdds?: string }): Promise<string> {
  const identity = JSON.stringify({ id: slip.id, totalOdds: slip.totalOdds, selections: slip.selections?.map(selection => ({
    fixtureId: selection.fixtureId, family: selection.family, selection: selection.selection, kickoffAt: selection.kickoffAt,
    odds: selection.odds, probability: selection.probability, forecast: selection.forecast ? {
      cycleId: selection.forecast.cycleId, revisionId: selection.forecast.revisionId, publishedAt: selection.forecast.publishedAt,
    } : null,
  })) });
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(identity));
  return Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, "0")).join("");
}
