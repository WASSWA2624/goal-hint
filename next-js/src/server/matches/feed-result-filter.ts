import "server-only";

import type { PredictionResult } from "../../domain/performance-summary.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { MatchFeedError } from "./feed-error.ts";
import { readFeedPerformance } from "./feed-performance.ts";
import type { feedSql } from "./feed-read.ts";

/** Resolve membership from the same selected-pick audit as the summary, before count and pagination.
 * Open or corrected settlements stay pending. Scores/status alone never manufacture a win or loss. */
export async function filterFeedResult(tx: Prisma.TransactionClient, sql: ReturnType<typeof feedSql>, result: PredictionResult,
  audit = readFeedPerformance) {
  const outcomes = new Map<string, PredictionResult>();
  let after: { id: string; kickoff: Date } | null = null;
  for (;;) {
    const rows: { id: string; kickoff: Date; cycleState: string; fixtureStatus: string }[] = await tx.$queryRaw(Prisma.sql`
      SELECT STRAIGHT_JOIN f.id,f.kickoff,c.state AS cycleState,f.status AS fixtureStatus
      ${sql.countJoins} ${sql.searchJoin} WHERE ${sql.where} AND m.available=TRUE
      ${after ? Prisma.sql`AND (f.kickoff>${after.kickoff} OR (f.kickoff=${after.kickoff} AND f.id>${after.id}))` : Prisma.empty}
      ORDER BY f.kickoff,f.id LIMIT 500`);
    for (const row of rows) {
      if (!(row.kickoff instanceof Date) || outcomes.has(row.id)) throw new MatchFeedError("unavailable");
      outcomes.set(row.id, row.cycleState === "void" ? row.fixtureStatus === "canceled" ? "cancelled" : "void" : "pending");
    }
    if (rows.length < 500) break;
    after = rows.at(-1)!;
  }
  const counts = { total: outcomes.size, available: outcomes.size, void: 0, cancelled: 0 };
  for (const outcome of outcomes.values()) {
    if (outcome === "void" || outcome === "cancelled") counts[outcome]++;
  }
  await audit(tx, sql, counts, undefined, (id, outcome) => {
    if (!outcomes.has(id)) throw new MatchFeedError("unavailable");
    outcomes.set(id, outcome);
  });
  const ids = [...outcomes].flatMap(([id, outcome]) => outcome === result ? [id] : []);
  // One bound JSON parameter avoids a placeholder per fixture in large date cohorts.
  const membership = ids.length ? Prisma.sql`f.id IN (SELECT matched.id FROM JSON_TABLE(${JSON.stringify(ids)}, '$[*]'
    COLUMNS (id VARCHAR(128) PATH '$')) AS matched)` : Prisma.sql`FALSE`;
  return { ...sql, where: Prisma.sql`${sql.where} AND ${membership}`, cohortWhere: Prisma.sql`${sql.cohortWhere} AND ${membership}` };
}
