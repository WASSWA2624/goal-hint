import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import { getReportingDate, type UtcInstant } from "../../domain/calendar.ts";
import { DatabaseOperationError, type DatabaseRuntime } from "../database/client.ts";
import { API_FOOTBALL_CONTRACT_VERSION } from "./api-football-contract.ts";
import { catalogScopeKey } from "./catalog-input.ts";
import { catalogPersistenceUnavailable, historyReplayKind, historyReplayScopePrefix } from "./catalog-mysql-store.ts";
import { readFootballHistoryDetailCoverage } from "./history-details.ts";
import { reviewedFixtureRejectionCount, reviewedFixtureReplayMarkerMatches, reviewedHistoryFixtureRepair } from "./history-fixture-correction.ts";
import { footballHistoryFixtureScopeFingerprint, readUpcomingFootballHistorySeasons, type FootballHistorySeasonScope } from "./history-fixture-scope.ts";
import { createFootballHistorySource } from "./history-source.ts";

const provider = "api-football";
const localArchiveMetadata = new Set(["playerArchiveConflict", "playerArchiveGeneration", "trophiesOmitted", "sidelinedOmitted"]);
const league = z.object({ league: z.object({ id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) }),
  seasons: z.array(z.unknown()) });
const season = z.object({ year: z.number().int().min(1000).max(9999) });
const reasonsSchema = z.array(z.string());
const receiptFields = { id: true, scopeKey: true, status: true, observedAt: true, receivedCount: true, rejectedCount: true,
  requestsDispatched: true, reasons: true } as const;
type FixtureReceipt = Readonly<{ id: string; scopeKey: string; status: string; observedAt: Date; receivedCount: number;
  rejectedCount: number; requestsDispatched: number; reasons: unknown }>;

function catalogScopes(rows: readonly unknown[], currentYear: number, activeSeasons: ReadonlySet<string>) {
  const scopes = new Map<string, FootballHistorySeasonScope>(), future = new Set<string>(), competitions = new Set<number>();
  let invalidLeagues = 0, invalidSeasons = 0, leaguesWithoutSeasons = 0;
  for (const row of rows) {
    const entry = league.safeParse(row);
    if (!entry.success) { invalidLeagues++; continue; }
    const competitionId = entry.data.league.id;
    competitions.add(competitionId);
    if (!entry.data.seasons.length) leaguesWithoutSeasons++;
    for (const row of entry.data.seasons) {
      const parsed = season.safeParse(row);
      if (!parsed.success) { invalidSeasons++; continue; }
      const year = parsed.data.year, key = `${competitionId}:${year}`;
      if (year > currentYear) future.add(key);
      if (year <= currentYear || activeSeasons.has(key)) {
        const query = { competitionId, season: year };
        scopes.set(catalogScopeKey({ kind: "fixtures", query }), query);
      }
    }
  }
  return { scopes, future: future.size, competitions, invalidLeagues, invalidSeasons, leaguesWithoutSeasons };
}

const replayKey = (id: string) => createHash("sha256").update(historyReplayScopePrefix + id).digest("hex");
const reasonList = (receipt: FixtureReceipt) => reasonsSchema.safeParse(receipt.reasons).data ?? [];

async function fixtureEvidence(scope: FootballHistorySeasonScope, receipts: readonly FixtureReceipt[], replayed: ReadonlySet<string>,
  source: Pick<ReturnType<typeof createFootballHistorySource>, "readExactFixtureScope">) {
  if (!receipts.length) return "unattempted" as const;
  let unmatched = false, rawOnly = false;
  const parameters = { league: String(scope.competitionId), season: String(scope.season), timezone: "Africa/Kampala" };
  for (const receipt of receipts) {
    const reasons = reasonList(receipt);
    const reviewed = reviewedHistoryFixtureRepair(receipt.id);
    const completed = reviewed ? replayed.has(replayKey(receipt.id)) :
      receipt.rejectedCount === 0 && (receipt.status === "complete" ||
        (reasons.includes(catalogPersistenceUnavailable) && replayed.has(replayKey(receipt.id))));
    const retained = receipt.requestsDispatched === 1 && receipt.receivedCount > 0 &&
      (reasons.includes(catalogPersistenceUnavailable) || reasons.includes("schema-error"));
    if (!completed && !retained) continue;
    const page = await source.readExactFixtureScope(parameters, { retrievedAt: receipt.observedAt.getTime(), rowCount: receipt.receivedCount });
    if (completed && page && (!reviewed || page.id === reviewed.pageId)) {
      return page.rows.length ? "verifiedData" as const : "verifiedEmpty" as const;
    }
    if (completed) unmatched = true;
    if (retained && page) rawOnly = true;
  }
  if (rawOnly) return "rawOnly" as const;
  if (unmatched) return "unverifiedSource" as const;
  if (receipts.some((receipt) => reasonList(receipt).some((reason) => reason === "response-too-large" || reason === "pagination-incomplete"))) {
    return "partitionRequired" as const;
  }
  return "retryPending" as const;
}

/** Audit exactly the seasons listed in the saved provider catalog, without provider requests. */
export async function readFootballArchiveCoverage(database: DatabaseRuntime, at: UtcInstant, includeActiveFuture = false) {
  const source = createFootballHistorySource(database);
  const catalog = await source.latestPage({ endpoint: "competitions", parameters: {} }).catch((error: unknown) => {
    if (error instanceof DatabaseOperationError) throw error;
    return null;
  });
  const verifiedCatalog = catalog?.contract === API_FOOTBALL_CONTRACT_VERSION ? catalog : null;
  const throughSeason = Number(getReportingDate(at).slice(0, 4));
  const upcoming = includeActiveFuture ? await readUpcomingFootballHistorySeasons(database, at) : [];
  const activeSeasons = new Set(upcoming.map(({ competitionId, season }) => `${competitionId}:${season}`));
  const { scopes, future, competitions, invalidLeagues, invalidSeasons, leaguesWithoutSeasons } =
    catalogScopes(verifiedCatalog?.rows ?? [], throughSeason, activeSeasons);
  const entries = [...scopes];
  const plannedSeasons = new Set(entries.map(([, { competitionId, season }]) => `${competitionId}:${season}`));
  const unlistedActiveSeasons = [...activeSeasons].filter((key) => !plannedSeasons.has(key)).length;
  const receipts = new Map<string, FixtureReceipt[]>();
  const replayed = new Set<string>();
  for (let offset = 0; offset < entries.length; offset += 500) {
    const keys = entries.slice(offset, offset + 500).map(([key]) => key);
    const rows = await database.query((client) => client.footballImport.findMany({
      where: { provider, kind: "fixtures", scopeKey: { in: keys }, observedAt: { lte: new Date(at) } },
      select: receiptFields, orderBy: { sequence: "desc" },
    }));
    for (const row of rows) {
      const group = receipts.get(row.scopeKey);
      if (group) group.push(row);
      else receipts.set(row.scopeKey, [row]);
    }
    const deferred = new Map(rows.filter((row) => reviewedHistoryFixtureRepair(row.id) ||
      reasonList(row).includes(catalogPersistenceUnavailable)).map((row) => [replayKey(row.id), row]));
    if (deferred.size) {
      const completed = await database.query((client) => client.footballImport.findMany({
        where: { provider, kind: historyReplayKind, status: "complete", requestsDispatched: 0,
          scopeKey: { in: [...deferred.keys()] }, recordedAt: { lte: new Date(at) } },
        select: { scopeKey: true, subsetEvidenceRef: true, receivedCount: true, importedCount: true, rejectedCount: true },
      }));
      for (const marker of completed) {
        const receipt = deferred.get(marker.scopeKey);
        if (!receipt) continue;
        const reviewed = reviewedHistoryFixtureRepair(receipt.id);
        if (reviewed && (receipt.status !== "partial" || receipt.requestsDispatched !== 1 || receipt.receivedCount !== reviewed.expectedRows ||
          receipt.rejectedCount !== reviewedFixtureRejectionCount(reviewed) || !reviewedFixtureReplayMarkerMatches(reviewed, marker))) continue;
        replayed.add(marker.scopeKey);
      }
    }
  }
  const fixtureSeasons = { verifiedData: 0, verifiedEmpty: 0, rawOnly: 0, unverifiedSource: 0, partitionRequired: 0, retryPending: 0, unattempted: 0 };
  for (let offset = 0; offset < entries.length; offset += 8) {
    const states = await Promise.all(entries.slice(offset, offset + 8)
      .map(([key, scope]) => fixtureEvidence(scope, receipts.get(key) ?? [], replayed, source)));
    for (const state of states) fixtureSeasons[state]++;
  }
  const [fixtures, results, archived, subjects] = await Promise.all([
    database.query((client) => client.footballFixture.count({ where: { provider } })),
    database.query((client) => client.footballFixture.count({ where: { provider, resultState: { result: { regulationVerified: true } } } })),
    database.query((client) => client.footballHistorySourcePage.groupBy({ by: ["endpoint"], _count: { _all: true }, _max: { retrievedAt: true } })),
    database.query((client) => client.$queryRaw<{ kind: string; total: bigint }[]>`SELECT kind, COUNT(*) AS total FROM FootballHistorySubject GROUP BY kind`),
  ]);
  const mappings = await database.query((client) => client.footballCompetitionProvider.findMany({
    where: { provider }, select: { externalId: true },
  }));
  const mapped = mappings.map(({ externalId }) => Number(externalId));
  const unlisted = mapped.filter((id) => !competitions.has(id)).length;
  const details = mapped.length ? await readFootballHistoryDetailCoverage(database, mapped, at) : null;
  const observations = archived.map(({ endpoint, _count, _max }) => ({ endpoint, pages: _count._all, lastSaved: _max.retrievedAt }));
  return {
    observedAt: new Date(at).toISOString(), requests: 0, fixtures, verifiedResults: results,
    fixtureScopeFingerprint: footballHistoryFixtureScopeFingerprint(scopes.values()),
    catalog: { retrievedAt: verifiedCatalog?.retrievedAt.toISOString() ?? null, competitions: competitions.size,
      invalidLeagues, invalidSeasons, leaguesWithoutSeasons, mappedCompetitionsOutsideCatalog: unlisted,
      futureSeasonLabels: future, unlistedActiveSeasons },
    fixtureSeasons: { throughSeason, total: entries.length, ...fixtureSeasons,
      verifiedComplete: entries.length > 0 && invalidLeagues === 0 && invalidSeasons === 0 && leaguesWithoutSeasons === 0 &&
        unlisted === 0 && unlistedActiveSeasons === 0 && fixtureSeasons.verifiedData + fixtureSeasons.verifiedEmpty === entries.length },
    matchDetails: details,
    archiveObservations: observations.filter(({ endpoint }) => !localArchiveMetadata.has(endpoint)),
    archiveMarkers: observations.filter(({ endpoint }) => localArchiveMetadata.has(endpoint)),
    indexedSubjects: subjects.map(({ kind, total }) => ({ kind, count: Number(total) })),
  };
}
