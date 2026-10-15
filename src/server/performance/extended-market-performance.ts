import "server-only";

import { z } from "zod";
import type { DatabaseRuntime } from "../database/client.ts";
import { freezeEvidence } from "../evidence/evidence-input.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { historyFail } from "../predictions/history-contract.ts";
import { historyInstant } from "../predictions/history-input.ts";

export const extendedSettlementStatuses = ["correct", "incorrect", "half-win", "half-loss", "push", "pending", "void", "unavailable"] as const;
export type ExtendedSettlementStatus = typeof extendedSettlementStatuses[number];
export type ExtendedPredictionSource = "ai-score-distribution" | "market-implied";
const marketKey = z.string().max(128).regex(/^(?:goal|implied):[a-z0-9:._-]+$/u);
const querySchema = z.strictObject({ from: historyInstant, to: historyInstant,
  source: z.enum(["ai-score-distribution", "market-implied"]).optional(),
  marketKeys: z.array(marketKey).min(1).max(256).refine((keys) => new Set(keys).size === keys.length).optional(),
}).refine(({ from, to }) => to > from && to - from <= 366 * 86_400_000);
export type ExtendedMarketPerformanceQuery = Readonly<{
  from: number; to: number; source?: ExtendedPredictionSource; marketKeys?: readonly string[];
}>;
export type ExtendedMarketPerformance = Readonly<{
  source: ExtendedPredictionSource; marketKey: string; ruleVersion: string;
  counts: Readonly<Record<ExtendedSettlementStatus, number>>; total: number;
  binaryCorrect: number; binaryIncorrect: number; binaryDenominator: number; binaryHitRate: number | null;
  /** Descriptive settled outcomes are not evidence of probability calibration for either source. */
  calibration: "not-established";
}>;
export type ExtendedMarketPerformanceRow = Readonly<{
  source: unknown; marketKey: unknown; ruleVersion: unknown; status: unknown; count: unknown; binaryCount: unknown;
}>;
const count = z.union([z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  z.bigint().nonnegative().max(BigInt(Number.MAX_SAFE_INTEGER))]).transform(Number);
const rowSchema = z.strictObject({ source: z.enum(["ai-score-distribution", "market-implied"]), marketKey,
  ruleVersion: z.string().min(1).max(64), status: z.enum(extendedSettlementStatuses), count, binaryCount: count,
}).refine((row) => row.binaryCount <= row.count && (row.binaryCount === 0 || ["correct", "incorrect"].includes(row.status)) &&
  (row.source === "ai-score-distribution" ? row.marketKey.startsWith("goal:") : row.marketKey.startsWith("implied:")));

/** Every qualified market and source retains its own denominator; correction chains are not additional predictions. */
export function extendedMarketPerformanceFromRows(rows: readonly ExtendedMarketPerformanceRow[]): readonly ExtendedMarketPerformance[] {
  const groups = new Map<string, { source: ExtendedPredictionSource; marketKey: string; ruleVersion: string;
    counts: Record<ExtendedSettlementStatus, number>; binaryCorrect: number; binaryIncorrect: number }>();
  const seen = new Set<string>();
  for (const input of rows) {
    const parsed = rowSchema.safeParse(input);
    if (!parsed.success) return historyFail("invalid-state");
    const row = parsed.data, key = JSON.stringify([row.source, row.marketKey, row.ruleVersion]), identity = JSON.stringify([key, row.status]);
    if (seen.has(identity)) return historyFail("invalid-state");
    seen.add(identity);
    const group = groups.get(key) ?? { source: row.source, marketKey: row.marketKey, ruleVersion: row.ruleVersion,
      counts: Object.fromEntries(extendedSettlementStatuses.map((status) => [status, 0])) as Record<ExtendedSettlementStatus, number>,
      binaryCorrect: 0, binaryIncorrect: 0 };
    group.counts[row.status] = row.count;
    if (row.status === "correct") group.binaryCorrect = row.binaryCount;
    if (row.status === "incorrect") group.binaryIncorrect = row.binaryCount;
    groups.set(key, group);
  }
  return freezeEvidence([...groups.values()].sort((a, b) => a.source.localeCompare(b.source, "en") ||
    a.marketKey.localeCompare(b.marketKey, "en") || a.ruleVersion.localeCompare(b.ruleVersion, "en")).map((group) => {
    const total = Object.values(group.counts).reduce((sum, value) => sum + value, 0), binaryDenominator = group.binaryCorrect + group.binaryIncorrect;
    if (!Number.isSafeInteger(total) || !Number.isSafeInteger(binaryDenominator)) return historyFail("invalid-state");
    return { ...group, total, binaryDenominator, binaryHitRate: binaryDenominator === 0 ? null : group.binaryCorrect / binaryDenominator,
      calibration: "not-established" as const };
  }));
}

/** Separate read service, opt-in after additive migrations. No legacy headline metric or probability is overwritten. */
export function createExtendedMarketPerformanceService(options: Readonly<{ database: DatabaseRuntime; enabled?: boolean }>) {
  const enabled = options.enabled ?? false;
  if (typeof enabled !== "boolean") return historyFail("invalid-request");
  return Object.freeze({
    async read(input: ExtendedMarketPerformanceQuery) {
      if (!enabled) return historyFail("invalid-request");
      const parsed = querySchema.safeParse(input);
      if (!parsed.success) return historyFail("invalid-request");
      const query = parsed.data;
      const source = query.source ? Prisma.sql`AND r.source = ${query.source}` : Prisma.empty;
      const keys = query.marketKeys ? Prisma.sql`AND r.marketKey IN (${Prisma.join(query.marketKeys)})` : Prisma.empty;
      return options.database.transaction(async (tx) => {
        const rows = await tx.$queryRaw<ExtendedMarketPerformanceRow[]>(Prisma.sql`
          SELECT r.source, r.marketKey, JSON_UNQUOTE(JSON_EXTRACT(r.body, '$.ruleVersion')) AS ruleVersion,
            JSON_UNQUOTE(JSON_EXTRACT(r.body, '$.status')) AS status, COUNT(*) AS count,
            CAST(SUM(CASE WHEN c.state = 'closed' AND r.resultId IS NOT NULL
              AND JSON_EXTRACT(r.body, '$.resultUsable') = JSON_EXTRACT('true', '$')
              AND JSON_TYPE(JSON_EXTRACT(r.body, '$.selection')) = 'STRING'
              AND JSON_UNQUOTE(JSON_EXTRACT(r.body, '$.status')) IN ('correct','incorrect') THEN 1 ELSE 0 END) AS UNSIGNED) AS binaryCount
          FROM ExtendedMarketSettlement p
          JOIN ExtendedMarketSettlementRevision r ON r.id=p.revisionId AND r.cycleId=p.cycleId AND r.marketKey=p.marketKey AND r.fixtureId=p.fixtureId
          JOIN PredictionCycle c ON c.id=p.cycleId AND c.fixtureId=p.fixtureId AND c.lockedSetId=r.predictionRevisionId
          JOIN FootballFixture f ON f.id=p.fixtureId AND f.activeCycleId=p.cycleId
          LEFT JOIN FixtureResultState rs ON rs.fixtureId=p.fixtureId
          LEFT JOIN FixtureResult fr ON fr.id=rs.resultId AND fr.fixtureId=p.fixtureId
          LEFT JOIN FixtureLifecycleState lifecycle ON lifecycle.fixtureId=p.fixtureId
          WHERE c.kickoffAt >= ${new Date(query.from)} AND c.kickoffAt < ${new Date(query.to)} ${source} ${keys}
            AND (JSON_UNQUOTE(JSON_EXTRACT(r.body, '$.status')) NOT IN ('correct','incorrect','half-win','half-loss','push')
              OR (c.state='closed' AND lifecycle.issue IS NULL AND r.resultId=rs.resultId
                AND fr.status=f.status AND fr.regulationVerified=TRUE
                AND fr.regulationHome <=> f.regulationHome AND fr.regulationAway <=> f.regulationAway
                AND JSON_EXTRACT(r.body, '$.resultUsable')=JSON_EXTRACT('true', '$')
                AND (r.source='ai-score-distribution' OR JSON_UNQUOTE(JSON_EXTRACT(r.body, '$.evidenceId'))=(
                  SELECT evidence.id FROM ImpliedMarketResultEvidence evidence WHERE evidence.fixtureId=r.fixtureId AND evidence.resultId=r.resultId
                  ORDER BY evidence.sequence DESC LIMIT 1))))
          GROUP BY r.source, r.marketKey, JSON_UNQUOTE(JSON_EXTRACT(r.body, '$.ruleVersion')),
            JSON_UNQUOTE(JSON_EXTRACT(r.body, '$.status')) ORDER BY r.source, r.marketKey, ruleVersion, status`);
        return freezeEvidence({ from: query.from, to: query.to, markets: extendedMarketPerformanceFromRows(rows) });
      }, { isolationLevel: "RepeatableRead" });
    },
  });
}
