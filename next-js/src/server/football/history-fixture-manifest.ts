import "server-only";

import { z } from "zod";
import { parseReportingDate } from "../../domain/calendar.ts";
import { footballSourceHash } from "./source-page-payload.ts";
import type { createFootballHistorySource } from "./history-source.ts";

const competitionId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const count = z.number().int().nonnegative();
const manifestSchema = z.strictObject({
  version: z.literal(1),
  anchorDate: z.string().transform(parseReportingDate),
  dateScanned: z.literal(true).exactOptional(),
  catalogAt: count,
  seasons: z.array(z.strictObject({
    scope: z.strictObject({ competitionId, season: z.number().int().min(1000).max(9999) }),
    coverage: z.record(z.string(), z.boolean().nullable()),
  })),
  unlistedCompetitions: z.array(competitionId),
  cursor: z.strictObject({ next: count, completed: count, empty: count, deferred: z.array(count) }).exactOptional(),
});
export type FixtureBackfillManifest = z.output<typeof manifestSchema>;
export type FixtureBackfillManifestStore = Readonly<{
  read(competitionIds: readonly number[], oldestSeason: number): Promise<FixtureBackfillManifest | null>;
  save(competitionIds: readonly number[], oldestSeason: number, manifest: FixtureBackfillManifest, observedAt: number): Promise<void>;
}>;

/** The scope approval and earliest requested season identify one fixed fixture scan. */
export function createFixtureBackfillManifestStore(source: Pick<ReturnType<typeof createFootballHistorySource>, "latestPage" | "savePage">): FixtureBackfillManifestStore {
  const selector = (ids: readonly number[], oldestSeason: number) => ({ endpoint: "fixtureBackfillManifest" as const,
    parameters: { scope: footballSourceHash(JSON.stringify([[...ids].sort((left, right) => left - right), oldestSeason])) } });
  return {
    async read(ids, oldestSeason) {
      const page = await source.latestPage(selector(ids, oldestSeason));
      if (!page) return null;
      const [manifest] = z.tuple([manifestSchema]).parse(page.rows);
      const allowed = new Set(ids), unique = new Set(manifest.seasons.map(({ scope }) => `${scope.competitionId}:${scope.season}`));
      const cursor = manifest.cursor;
      if (unique.size !== manifest.seasons.length || manifest.seasons.some(({ scope }) => !allowed.has(scope.competitionId) || scope.season < oldestSeason) ||
          manifest.unlistedCompetitions.some((id) => !allowed.has(id)) || cursor && (cursor.next > manifest.seasons.length ||
            cursor.completed + cursor.deferred.length !== cursor.next || cursor.empty > cursor.completed ||
            cursor.deferred.some((index) => index >= cursor.next) || new Set(cursor.deferred).size !== cursor.deferred.length)) {
        throw new Error("Archived fixture work manifest does not match the approved scope.");
      }
      return manifest;
    },
    async save(ids, oldestSeason, manifest, observedAt) {
      await source.savePage({ ...selector(ids, oldestSeason), rows: [manifestSchema.parse(manifest)], retrievedAt: observedAt });
    },
  };
}
