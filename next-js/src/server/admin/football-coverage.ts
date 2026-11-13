import "server-only";

import { getReportingDate, type UtcInstant } from "../../domain/calendar.ts";
import { historyImportCoverage, historyImportPhases, historyImportStatus, type FootballCoverage } from "../../domain/football-coverage.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { displayedSet, publicFixtureScope } from "../matches/feed-read.ts";
import { historyJson } from "../predictions/history-read.ts";

const since = (at: number, hours: number) => new Date(at - hours * 3_600_000);

/** The same fixture scope and displayed revisions that the public feed reads. No provider calls. */
export async function readFootballCoverage(database: DatabaseRuntime, now: UtcInstant, ids: readonly number[]): Promise<FootballCoverage> {
  const date = getReportingDate(now);
  const day = new Date(`${date}T00:00:00.000Z`);
  const [archive, matches, attempt, odds] = await Promise.all([
    database.query((client) => client.footballHistoryImportStatus.findMany()).catch(() => null),
    ids.length ? database.query((client) => client.$queryRaw<{ stored: bigint; publicScope: bigint; published: bigint }[]>(Prisma.sql`
      SELECT COUNT(*) AS stored, COUNT(CASE WHEN ${publicFixtureScope(ids)} THEN 1 END) AS publicScope,
        COUNT(CASE WHEN ${publicFixtureScope(ids)} AND ${displayedSet} IS NOT NULL THEN 1 END) AS published
      FROM FootballFixture f JOIN FootballSeason s ON s.id=f.seasonId JOIN FootballCompetition l ON l.id=s.competitionId
      LEFT JOIN PredictionCycle c ON c.id=f.activeCycleId AND c.fixtureId=f.id
      WHERE f.provider='api-football' AND f.eatDate=${day}`)).then(([row]) => row).catch(() => null) : null,
    database.query((client) => client.dailyRunImport.findFirst({ where: { eatDate: day },
      orderBy: [{ run: { eatDate: "desc" } }, { attempt: "desc" }], select: { id: true, failure: true } })).catch(() => null),
    database.query((client) => client.oddsImportBatch.groupBy({ by: ["kind", "status"], _count: { _all: true },
      where: { receivedAt: { gte: since(now, 24) } } })).catch(() => null),
  ]);
  const receipt = attempt ? await database.query((client) => client.footballImport.findUnique({ where: { id: attempt.id },
    select: { status: true, receivedCount: true, importedCount: true, rejectedCount: true } })).catch(() => null) : null;
  return {
    archive: historyImportPhases.map((phase) => {
      const row = archive?.find((item) => item.phase === phase);
      const parsedStatus = historyImportStatus.safeParse(row?.status);
      const interrupted = parsedStatus.data === "running" && row && now - row.updatedAt.getTime() > 5 * 60_000;
      const status: FootballCoverage["archive"][number]["status"] = interrupted ? "retrying" :
        parsedStatus.data ?? (archive ? "unreported" : "unavailable");
      return { phase, status,
        coverage: row ? historyImportCoverage.safeParse(historyJson(row.coverage)).data ?? null : null };
    }),
    fixtures: { date, receipt, attemptFailed: Boolean(attempt?.failure),
      stored: matches ? Number(matches.stored) : null, publicScope: matches ? Number(matches.publicScope) : null,
      published: matches ? Number(matches.published) : null },
    odds: odds?.map(({ kind, status, _count }) => ({ kind, status, batches: _count._all })) ?? null,
  };
}
