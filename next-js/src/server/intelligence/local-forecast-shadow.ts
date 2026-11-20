import "server-only";

import type { DatabaseRuntime } from "../database/client.ts";
import { evidenceFingerprint } from "../evidence/evidence-input.ts";
import { buildFixtureModelEvidence } from "../evidence/fixture-model-evidence.ts";
import { validateIntelligenceForecast } from "./forecast-validator.ts";
import { readLiveLocalGoalHistory } from "./live-local-history.ts";
import { estimateLocalGoals, localGoalModelVersion } from "./local-goals-model.ts";
import { DEFAULT_MONITORING_POLICY, type MonitoringObservation } from "./monitoring.ts";
import { createShadowIntelligenceService } from "./shadow-service.ts";
import { createMysqlShadowStore } from "./shadow-store.ts";

const forecastLockMs = 5 * 60_000;
const horizonMs = 7 * 86_400_000;
const captureIntervalMs = 6 * 3_600_000;
const budgetMs = 90_000;
const modelVersion = localGoalModelVersion();
// Older schedule receipts can support private model testing, with eligibility withheld.
const capturePolicy = { ...DEFAULT_MONITORING_POLICY, version: "canonical-local-forecast-shadow-v1",
  maximumAgeMs: Number.MAX_SAFE_INTEGER };

type ShadowTarget = Readonly<{
  id: string; competitionId: string; homeTeamId: string; awayTeamId: string;
  dataVersion: bigint; kickoff: Date; retrievedAt: Date;
}>;

/** Captures prospective candidates privately on the same result corpus as the live local engine. */
export async function captureLocalForecasts(database: Pick<DatabaseRuntime, "query" | "transaction">, limit: number,
  signal?: AbortSignal) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new RangeError("Use a fixture limit from 1 to 100.");
  const store = createMysqlShadowStore(database);
  const service = createShadowIntelligenceService({ store, mode: "shadow", policy: capturePolicy });
  const started = Date.now();
  const due = await database.query((tx) => tx.$queryRaw<ShadowTarget[]>`
    SELECT f.id, s.competitionId, f.homeTeamId, f.awayTeamId, f.dataVersion, f.kickoff, f.retrievedAt
    FROM FootballFixture f JOIN FootballSeason s ON s.id = f.seasonId
    LEFT JOIN FixtureLifecycleState life ON life.fixtureId = f.id
    LEFT JOIN IntelligenceShadowState shadow ON shadow.fixtureId = f.id
    WHERE f.provider = 'api-football' AND f.status = 'scheduled' AND f.kickoff > ${new Date(started + forecastLockMs)}
      AND f.kickoff < ${new Date(started + horizonMs)} AND f.homeTeamId <> f.awayTeamId AND life.issue IS NULL
      AND f.createdAt <= ${new Date(started)} AND f.retrievedAt <= ${new Date(started)}
      AND (f.providerUpdatedAt IS NULL OR f.providerUpdatedAt <= ${new Date(started)})
      AND (shadow.lastCheckedAt IS NULL OR shadow.lastCheckedAt <= ${new Date(started - captureIntervalMs)})
    ORDER BY shadow.lastCheckedAt IS NOT NULL, f.kickoff, f.id LIMIT ${limit}`);
  const report = { selected: due.length, recorded: 0, estimated: 0, eligible: 0, abstained: 0,
    staleSchedule: 0, reused: 0, cutoff: 0, failed: 0 };
  const historyByCompetition = new Map<string, Awaited<ReturnType<typeof readLiveLocalGoalHistory>>>();
  for (const row of due) {
    const checkedAt = Date.now(), kickoffAt = row.kickoff.getTime(), observedAt = row.retrievedAt.getTime();
    if (signal?.aborted || checkedAt - started >= budgetMs) break;
    if (checkedAt >= kickoffAt - forecastLockMs) { report.cutoff++; continue; }
    const slot = Math.floor(checkedAt / captureIntervalMs);
    const checkId = evidenceFingerprint({ version: capturePolicy.version, fixtureId: row.id, slot });
    const fixture = { fixtureId: row.id, competitionId: row.competitionId, homeTeamId: row.homeTeamId,
      awayTeamId: row.awayTeamId, forecastAt: checkedAt, kickoffAt };
    const stale = checkedAt - observedAt > DEFAULT_MONITORING_POLICY.maximumAgeMs;
    const observation: MonitoringObservation = { fixtureId: row.id, observedAt, receivedAt: observedAt, kickoffAt,
      status: "scheduled", confirmedMajorAbsences: null, unexpectedLineup: null, seriousSecurityIssue: null,
      context: null, odds: null, probabilities: null };
    try {
      if (await store.check(checkId)) { report.reused++; continue; }
      // Freeze one stored history scope per competition for this batch.
      let rows = historyByCompetition.get(row.competitionId);
      if (!rows) {
        rows = await database.query((tx) => readLiveLocalGoalHistory(tx, row.competitionId, started));
        historyByCompetition.set(row.competitionId, rows);
      }
      if (signal?.aborted) break;
      if (Date.now() >= kickoffAt - forecastLockMs) { report.cutoff++; continue; }
      const evidence = buildFixtureModelEvidence({ fixture, history: rows });
      const history = evidence.history.map(({ halfTime, ...result }) => {
        void halfTime;
        return result;
      });
      let assessment: ReturnType<typeof validateIntelligenceForecast> | undefined;
      await service.observe({ checkId, fixtureId: row.id, checkedAt, observation, modelVersion,
        dependencyHash: evidenceFingerprint({ stale, history, fixtureVersion: String(row.dataVersion) }),
        executionDeadlineAt: kickoffAt - forecastLockMs, target: { fixtureVersion: row.dataVersion, kickoffAt },
        async evaluate() {
          const local = estimateLocalGoals({ fixture, history });
          assessment = validateIntelligenceForecast({ fixture, local, fixtureStatus: "scheduled" });
          if (!stale) return assessment;
          const { hash: originalHash, ...validated } = assessment;
          void originalHash;
          const withheld = { ...validated, decision: "withhold" as const, probabilities: null, oddsValue: null,
            reasons: [...validated.reasons, "stored-schedule-stale"] };
          assessment = { ...withheld, hash: evidenceFingerprint(withheld) };
          return assessment;
        },
      });
      report.recorded++;
      if (!assessment) { report.reused++; continue; }
      if (stale) report.staleSchedule++;
      if (assessment.components.local.status === "estimated") report.estimated++;
      else report.abstained++;
      if (assessment.decision === "eligible-shadow") report.eligible++;
    } catch {
      // A single unreadable or rescheduled fixture cannot block the rest of the cohort.
      report.failed++;
    }
  }
  return report;
}
