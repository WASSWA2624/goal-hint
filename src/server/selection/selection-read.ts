import "server-only";

import { getReportingDate, parseReportingDate, utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import { selectionFail, type SelectionManifest } from "./selection-contract.ts";

/** Later feed projections must consult date coverage before claiming emptiness. */
export function selectionDateState(manifest: SelectionManifest, input: string) {
  const date = parseReportingDate(input), coverage = manifest.coverage.find((entry) => entry.date === date);
  if (!coverage) return selectionFail("invalid-request");
  const count = manifest.entries.filter((entry) => getReportingDate(utcInstantFromEpochMilliseconds(entry.kickoffAt)) === date).length;
  return Object.freeze({ date, count, state: coverage.status !== "complete" ? count > 0 ? "partial" : "data-unavailable" :
    count > 0 ? "selected" : "no-fixtures", importId: coverage.importId, missingCoverage: coverage.missingCoverage });
}
