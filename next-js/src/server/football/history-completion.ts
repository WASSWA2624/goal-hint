import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import { utcInstantFromEpochMilliseconds, type Clock, type UtcInstant } from "../../domain/calendar.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { readFootballArchiveCoverage } from "./history-coverage.ts";
import { footballHistoryCatalogMaxAgeMs } from "./history-fixture-scope.ts";
import { createFootballHistorySource } from "./history-source.ts";

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const fingerprint = z.string().regex(/^[a-f0-9]{64}$/u);
const zero = z.literal(0);
const settled = { status: z.literal("complete"), stopped: z.null() };
const fixturesPass = z.object({ ...settled, planned: count.positive(), completed: count, archivedOnly: zero, deferred: zero,
  imported: zero, processed: zero, unlistedCompetitions: z.array(z.number()).length(0), fixtureScopeFingerprint: fingerprint,
  providerDayEndsAt: count.positive() }).refine(({ planned, completed }) => planned === completed);
const detailCoverage = z.object({ eligible: count, storedComplete: count, unsupported: count, exhausted: zero, delayed: zero, due: zero })
  .refine(({ eligible, storedComplete, unsupported }) => eligible === storedComplete + unsupported);
const detailsPass = z.object({ status: z.enum(["complete", "partial"]), passComplete: z.literal(true),
  stopped: z.null(), requests: zero, received: zero, written: zero,
  coverage: detailCoverage });
const mappingReport = z.object({ ...settled, day: z.iso.date(), totalPages: count.positive(), pagesVerified: count.positive(),
  fixturesVerified: count }).refine(({ totalPages, pagesVerified }) => totalPages === pagesVerified);
const referencePass = z.object({ ...settled, archived: zero, deferred: zero, oddsMapping: mappingReport,
  verification: z.object({ complete: z.literal(true), scope: z.literal("discovered"), reason: z.null(),
    providerDayEndsAt: count.positive() }) });
const replayPass = z.object({ ...settled, pending: zero, unverified: zero, written: zero, imported: zero });
const roundPass = z.object({ fixtures: fixturesPass, details: detailsPass, reference: referencePass, replay: replayPass });

const limits = Object.freeze(["Fixture coverage follows the saved catalog and active seasons in the import horizon.",
  "Reference coverage follows discovered provider selectors.",
  "Live prices and provider predictions are collected prospectively outside the historical archive.",
  "Odds mapping verification covers the saved pages for one UTC day."] as const);
const utcDay = (at: UtcInstant) => new Date(at).toISOString().slice(0, 10);

/** Verify a settled archive pass against the saved source data without calling the provider. */
export async function readFootballArchiveCompletion(database: DatabaseRuntime, at: UtcInstant, pass: unknown,
  clock: Clock = { now: () => utcInstantFromEpochMilliseconds(Date.now()) }) {
  const base = { scope: "historical-archive" as const, requests: 0, checkedAt: new Date(at).toISOString(), limits };
  const pending = (reasons: string[]) => ({ ...base, status: "pending" as const, pending: reasons, verifiedAt: null, snapshotId: null });
  const parsed = roundPass.safeParse(pass);
  if (!parsed.success) {
    const phases = new Set(parsed.error.issues.map(({ path }) => String(path[0] ?? "archive")));
    return pending([...phases].map((phase) => `${phase}-pass-unverified`));
  }
  const { fixtures, details, reference } = parsed.data;
  const providerDayEndsAt = fixtures.providerDayEndsAt, day = utcDay(at);
  if (reference.verification.providerDayEndsAt !== providerDayEndsAt || at >= providerDayEndsAt || reference.oddsMapping.day !== day) {
    return pending(["provider-day-changed"]);
  }

  const audit = await readFootballArchiveCoverage(database, at, true);
  const catalogAt = audit.catalog.retrievedAt === null ? NaN : Date.parse(audit.catalog.retrievedAt);
  const reasons: string[] = [];
  if (!Number.isFinite(catalogAt) || catalogAt > at || at - catalogAt >= footballHistoryCatalogMaxAgeMs) reasons.push("catalog-unverified");
  if (!audit.fixtureSeasons.verifiedComplete || audit.fixtureSeasons.total !== fixtures.planned ||
    audit.fixtureScopeFingerprint !== fixtures.fixtureScopeFingerprint) reasons.push("fixture-seasons-unverified");
  const coverage = detailCoverage.safeParse(audit.matchDetails);
  if (!coverage.success || coverage.data.eligible !== audit.verifiedResults ||
    coverage.data.eligible !== details.coverage.eligible || coverage.data.storedComplete !== details.coverage.storedComplete ||
    coverage.data.unsupported !== details.coverage.unsupported) reasons.push("match-details-unverified");
  if (reasons.length) return pending(reasons);

  const source = createFootballHistorySource(database);
  const pages = await source.readOddsMappingPages(day);
  const mappedFixtures = pages?.flatMap(({ rows }) => rows.map(({ id }) => id)) ?? [];
  if (!pages || pages.length !== reference.oddsMapping.totalPages ||
    new Set(pages.map(({ page }) => page)).size !== pages.length ||
    pages.some(({ page, totalPages, retrievedAt }) => page > pages.length || totalPages !== pages.length || retrievedAt > at) ||
    mappedFixtures.length !== reference.oddsMapping.fixturesVerified ||
    new Set(mappedFixtures).size !== mappedFixtures.length) return pending(["odds-mapping-unverified"]);

  const integrity = await source.verifySavedPages(at);
  if (!integrity.checked || integrity.invalid || !integrity.stable) return pending(["archived-pages-unverified"]);
  const finishedAt = clock.now();
  if (finishedAt < at || finishedAt >= providerDayEndsAt || utcDay(finishedAt) !== day) return pending(["provider-day-changed"]);
  if (finishedAt - catalogAt >= footballHistoryCatalogMaxAgeMs) return pending(["catalog-unverified"]);

  const snapshotId = createHash("sha256").update(`api-football:historical-archive:v1:${fixtures.fixtureScopeFingerprint}`).digest("hex");
  return { ...base, status: "complete" as const, pending: [], verifiedAt: new Date(finishedAt).toISOString(), snapshotId,
    catalogRetrievedAt: audit.catalog.retrievedAt, fixtureScopeFingerprint: audit.fixtureScopeFingerprint,
    fixtures: { total: audit.fixtureSeasons.total, verifiedData: audit.fixtureSeasons.verifiedData, verifiedEmpty: audit.fixtureSeasons.verifiedEmpty },
    matchDetails: coverage.data, archivePagesVerified: integrity.checked, oddsMappingDay: day };
}
