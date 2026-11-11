import "server-only";

import { utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import { evidenceFingerprint } from "../evidence/evidence-input.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import type { ApiFootballBounds } from "../football/api-football-contract.ts";
import type { createApiFootballAdapter } from "../football/api-football-adapter.ts";
import type { NormalizedInPlayOdds } from "../football/api-football-normalize.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { mapInPlayOdds, reviewedInPlayCatalog } from "./in-play-odds-mapping.ts";
import { inPlayOddsFreshMs } from "./in-play-odds-read.ts";

const intervalMs = 30_000, dayMs = 86_400_000, minuteMs = 60_000;
const provider = "api-football";
type Adapter = Pick<ReturnType<typeof createApiFootballAdapter>["odds"], "inPlay" | "inPlayBets">;
type PollState = { nextPollAt: Date; catalogDueAt: Date; catalogJson: unknown };
type Fixture = { id: string; providerId: bigint; kickoffAt: Date; homeTeamId: string; awayTeamId: string;
  homeExternalId: bigint; awayExternalId: bigint; leagueExternalId: bigint; season: number };
type Previous = { fixtureId: string; kickoffAt: Date; homeTeamId: string; awayTeamId: string; semanticHash: string;
  checkedAt: Date; changedAt: Date; providerUpdatedAt: Date | null; withdrawnAt: Date | null };

function active(now: number) {
  return Prisma.sql`f.provider = ${provider}
    AND f.kickoff >= ${new Date(now - 6 * 60 * minuteMs)}
    AND (f.status = 'live' OR (f.status = 'scheduled' AND f.kickoff >= ${new Date(now - 45 * minuteMs)}
      AND f.kickoff <= ${new Date(now + 15 * minuteMs)}))`;
}

function bounds(now: number, deadline: number, catalog: boolean): ApiFootballBounds {
  return {
    priority: "enrichment", deadlineAt: utcInstantFromEpochMilliseconds(Math.min(deadline, now + 10_000)),
    timeoutMs: 8_000, maxRequests: 1, maxPages: 1, maxRows: catalog ? 1_000 : 3_000,
    maxResponseBytes: catalog ? 256 * 1024 : 24 * 1024 * 1024,
    retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0 }, cacheMaxAgeMs: 0,
  };
}

function savedCatalog(raw: unknown): Record<string, string> {
  try {
    const value: unknown = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
    return reviewedInPlayCatalog(Object.entries(value).flatMap(([id, name]) => typeof name === "string" ? [{ id: Number(id), name }] : []));
  } catch { return {}; }
}

async function claim(database: DatabaseRuntime, now: number) {
  const [candidate] = await database.query((tx) => tx.$queryRaw<{ ready: number }[]>`
    SELECT 1 AS ready FROM FootballFixture f WHERE ${active(now)} LIMIT 1`);
  if (!candidate) return null;
  return database.transaction(async (tx) => {
    await tx.$executeRaw`INSERT IGNORE INTO InPlayOddsPollState (provider, nextPollAt, catalogDueAt, catalogJson)
      VALUES (${provider}, ${new Date(0)}, ${new Date(0)}, JSON_OBJECT())`;
    const [previous] = await tx.$queryRaw<PollState[]>`SELECT nextPollAt, catalogDueAt, catalogJson
      FROM InPlayOddsPollState WHERE provider = ${provider} FOR UPDATE`;
    if (!previous || previous.nextPollAt.getTime() > now) return null;
    const fence = new Date(now + intervalMs);
    await tx.$executeRaw`UPDATE InPlayOddsPollState SET nextPollAt = ${fence} WHERE provider = ${provider}`;
    return { fence, catalogDueAt: previous.catalogDueAt.getTime(), catalog: savedCatalog(previous.catalogJson) };
  });
}

async function storePrices(database: DatabaseRuntime, rows: readonly NormalizedInPlayOdds[], catalog: Record<string, string>,
  retrievedAt: number, fence: Date, allowed: () => boolean) {
  const received = new Date(retrievedAt);
  return database.transaction(async (tx) => {
    const [state] = await tx.$queryRaw<{ nextPollAt: Date }[]>`SELECT nextPollAt FROM InPlayOddsPollState
      WHERE provider = ${provider} FOR UPDATE`;
    if (!allowed() || state?.nextPollAt.getTime() !== fence.getTime()) return 0;
    const fixtures = !rows.length ? [] : await tx.$queryRaw<Fixture[]>`
      SELECT f.id, f.externalId AS providerId, f.kickoff AS kickoffAt, f.homeTeamId, f.awayTeamId,
        h.externalId AS homeExternalId, a.externalId AS awayExternalId, c.externalId AS leagueExternalId, s.year AS season
      FROM FootballFixture f JOIN FootballSeason s ON s.id = f.seasonId
      JOIN FootballCompetitionProvider c ON c.competitionId = s.competitionId AND c.provider = f.provider
      JOIN FootballTeamProvider h ON h.teamId = f.homeTeamId AND h.provider = f.provider
      JOIN FootballTeamProvider a ON a.teamId = f.awayTeamId AND a.provider = f.provider
      WHERE ${active(retrievedAt)} AND f.externalId IN (${Prisma.join(rows.map(({ fixtureId }) => BigInt(fixtureId)))})`;
    const providerRows = new Map(rows.map((row) => [row.fixtureId, row]));
    const matched = fixtures.flatMap((fixture) => {
      const row = providerRows.get(Number(fixture.providerId));
      if (!row || row.homeTeamId !== Number(fixture.homeExternalId) || row.awayTeamId !== Number(fixture.awayExternalId)
        || row.competitionId !== Number(fixture.leagueExternalId) || row.season !== fixture.season) return [];
      return [{ fixture, row }];
    });
    const identities = [...new Set(matched.map(({ fixture }) => fixture.id))];
    const previous = !identities.length ? [] : await tx.$queryRaw<Previous[]>`SELECT fixtureId, kickoffAt, homeTeamId, awayTeamId,
      semanticHash, checkedAt, changedAt, providerUpdatedAt, withdrawnAt FROM FixtureInPlayOdds WHERE fixtureId IN (${Prisma.join(identities)})`;
    const byFixture = new Map(previous.map((entry) => [entry.fixtureId, entry]));
    let changed = 0;
    const updates = [];
    for (const { fixture, row } of new Map(matched.map((entry) => [entry.fixture.id, entry])).values()) {
      const prior = byFixture.get(fixture.id);
      const update = row.source.providerUpdatedAt;
      const sameOccurrence = prior?.kickoffAt.getTime() === fixture.kickoffAt.getTime()
        && prior.homeTeamId === fixture.homeTeamId && prior.awayTeamId === fixture.awayTeamId;
      if (sameOccurrence && (prior.checkedAt.getTime() > retrievedAt || prior.providerUpdatedAt !== null
        && (update === null || update < prior.providerUpdatedAt.getTime()))) continue;
      const body = mapInPlayOdds(row, catalog, true);
      if (body.state === "unavailable" && !prior) continue;
      const hash = evidenceFingerprint(body);
      const material = !sameOccurrence || prior.semanticHash !== hash;
      if (material || prior.withdrawnAt !== null) changed++;
      updates.push(Prisma.sql`(${fixture.id}, ${fixture.kickoffAt}, ${fixture.homeTeamId}, ${fixture.awayTeamId}, ${received},
        ${material ? received : prior.changedAt}, ${update === null ? null : new Date(update)}, NULL, ${hash}, ${JSON.stringify(body)})`);
    }
    for (let offset = 0; offset < updates.length; offset += 100) {
      await tx.$executeRaw`INSERT INTO FixtureInPlayOdds (fixtureId, kickoffAt, homeTeamId, awayTeamId, checkedAt, changedAt,
        providerUpdatedAt, withdrawnAt, semanticHash, bodyJson) VALUES ${Prisma.join(updates.slice(offset, offset + 100))}
        AS incoming ON DUPLICATE KEY UPDATE
          bodyJson = IF(FixtureInPlayOdds.semanticHash <> incoming.semanticHash, incoming.bodyJson, FixtureInPlayOdds.bodyJson),
          kickoffAt = incoming.kickoffAt, homeTeamId = incoming.homeTeamId, awayTeamId = incoming.awayTeamId,
          checkedAt = incoming.checkedAt, changedAt = incoming.changedAt, providerUpdatedAt = incoming.providerUpdatedAt,
          withdrawnAt = NULL, semanticHash = incoming.semanticHash`;
    }
    const omit = identities.length ? Prisma.sql`AND fixtureId NOT IN (${Prisma.join(identities)})` : Prisma.empty;
    changed += await tx.$executeRaw`UPDATE FixtureInPlayOdds SET withdrawnAt = ${received}, changedAt = ${received}
      WHERE checkedAt >= ${new Date(retrievedAt - inPlayOddsFreshMs)} AND checkedAt < ${received} AND withdrawnAt IS NULL ${omit}`;
    return changed;
  });
}

export function createInPlayOddsPoller(options: Readonly<{
  database: DatabaseRuntime; adapter: Adapter; now(): number; enabled(): boolean; displayAllowed(): boolean;
}>) {
  const { database, adapter, now } = options;
  const allowed = () => options.enabled() && options.displayAllowed();
  let nextTick = 0, running = false;
  return Object.freeze({ async poll() {
    let requests = 0;
    const result = (outcome: string, changed = 0) => ({ outcome, requests, changed });
    if (!allowed()) return result("disabled");
    const start = now();
    if (running || start < nextTick) return result("waiting");
    running = true;
    nextTick = start + intervalMs;
    try {
      const claimed = await claim(database, start);
      if (!claimed || !allowed()) return result("quiet");
      const deadline = claimed.fence.getTime();
      let catalog = claimed.catalog;
      if (claimed.catalogDueAt <= start) {
        const response = await adapter.inPlayBets(bounds(now(), deadline, true));
        requests += response.requestsDispatched;
        const next = response.status === "complete" ? reviewedInPlayCatalog(response.data) : {};
        const updated = Object.keys(next).length > 0;
        if (updated) catalog = next;
        if (!allowed()) return result("disabled");
        await database.query((tx) => tx.$executeRaw`UPDATE InPlayOddsPollState SET
          catalogDueAt = ${new Date(start + (updated ? dayMs : 15 * minuteMs))}, catalogJson = ${JSON.stringify(catalog)}
          WHERE provider = ${provider} AND nextPollAt = ${claimed.fence}`);
      }
      if (!Object.keys(catalog).length) return result("catalog-unavailable");
      if (!allowed() || now() >= deadline) return result("expired");
      const response = await adapter.inPlay(bounds(now(), deadline, false));
      requests += response.requestsDispatched;
      const page = response.provenance.at(-1);
      if (response.status !== "complete" || !page || page.fromCache || !allowed()) return result(response.error?.reason ?? "incomplete");
      return result("complete", await storePrices(database, response.data, catalog, page.retrievedAt, claimed.fence, allowed));
    } catch {
      return result("unavailable");
    } finally { running = false; }
  } });
}
