import "server-only";

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
