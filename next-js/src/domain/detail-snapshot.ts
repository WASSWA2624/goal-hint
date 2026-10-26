import type { MatchDetailResponse, StoredDetailSnapshot } from "./match-detail.ts";

/** Narrow a wire snapshot without loading response validators into presentation code. */
export function fullDetailSnapshot(data: Pick<MatchDetailResponse, "snapshot">): StoredDetailSnapshot | null {
  return data.snapshot && !("gated" in data.snapshot) ? data.snapshot : null;
}
