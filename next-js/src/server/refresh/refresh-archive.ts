import "server-only";

import { evidenceSerialize } from "../evidence/evidence-input.ts";
import { LOCAL_FIRST_FORECAST_CASCADE } from "../fallback/fallback-contract.ts";
import { refreshFail } from "./refresh-contract.ts";

/** Refresh receipts also contain nonnegative DECIMAL(38,0) cost amounts, including zero budget caps.
 * Identity and policy parsers apply their narrower bounds after this lossless archive decoding. */
export function refreshArchiveJson(value: unknown): unknown {
  try {
    return JSON.parse(typeof value === "string" ? value : JSON.stringify(value), (_key, child: unknown) => {
      if (child !== null && typeof child === "object" && "$evidenceInteger" in child) {
        if (Object.keys(child).length !== 1 || typeof child.$evidenceInteger !== "string" ||
          !/^(?:0|[1-9][0-9]{0,37})$/u.test(child.$evidenceInteger)) return refreshFail("unavailable");
        return BigInt(child.$evidenceInteger);
      }
      return child;
    });
  } catch { return refreshFail("unavailable"); }
}

function localFirstCandidate(value: unknown): boolean {
  const candidate = value as { audit?: { sourceCascade?: unknown } } | null | undefined;
  return candidate?.audit?.sourceCascade === LOCAL_FIRST_FORECAST_CASCADE;
}

/** Keep the canonical candidate as text so native MySQL JSON cannot round its model values. */
export function encodeFallbackStage(value: unknown): unknown {
  const receipt = value as Record<string, unknown> | null;
  if (!receipt || !localFirstCandidate(receipt.candidate)) return value;
  return { ...receipt, candidate: evidenceSerialize(receipt.candidate) };
}

export function decodeFallbackStage(value: unknown): unknown {
  const receipt = value as Record<string, unknown> | null;
  if (typeof receipt?.candidate !== "string") return value;
  const candidate = refreshArchiveJson(receipt.candidate);
  if (!localFirstCandidate(candidate) || evidenceSerialize(candidate) !== receipt.candidate) return refreshFail("unavailable");
  return { ...receipt, candidate };
}
