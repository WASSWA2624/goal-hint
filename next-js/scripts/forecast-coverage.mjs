import { parseArgs } from "node:util";
import { utcInstantFromEpochMilliseconds } from "../src/domain/calendar.ts";
import { evidenceFingerprint } from "../src/server/evidence/evidence-input.ts";
import { createLiveLocalEngine } from "../src/server/intelligence/live-local-engine.ts";
import { openForecastDatabase } from "./lib/forecast-database-target.mjs";

const dayMs = 86_400_000;

async function inspect(database, sampleSize, now) {
  const from = new Date(now), to = new Date(now + 7 * dayMs);
  const [coverage] = await database.query((tx) => tx.$queryRaw`
    SELECT COUNT(*) AS scheduled, COUNT(c.id) AS activeCycles, COUNT(p.id) AS published,
      COALESCE(SUM(EXISTS (SELECT 1 FROM MarketPrediction m
        WHERE m.setId = p.id AND m.available = TRUE AND m.source = 'local-engine')), 0) AS publishedWithLocalMarkets
    FROM FootballFixture f
    LEFT JOIN PredictionCycle c ON c.id = f.activeCycleId AND c.fixtureId = f.id AND c.state = 'open'
    LEFT JOIN PredictionSet p ON p.id = c.currentSetId AND p.cycleId = c.id AND p.publishedAt < c.cutoffAt
    WHERE f.provider = 'api-football' AND f.status = 'scheduled' AND f.kickoff > ${from} AND f.kickoff < ${to}`);
  const pending = await database.query((tx) => tx.$queryRaw`
    SELECT f.id, f.externalId, f.dataVersion, f.homeTeamId, f.awayTeamId, f.kickoff,
      h.externalId AS homeExternalId, a.externalId AS awayExternalId
    FROM FootballFixture f
    JOIN FootballTeamProvider h ON h.teamId = f.homeTeamId AND h.provider = f.provider
    JOIN FootballTeamProvider a ON a.teamId = f.awayTeamId AND a.provider = f.provider
    WHERE f.provider = 'api-football' AND f.status = 'scheduled' AND f.kickoff > ${from} AND f.kickoff < ${to}
      AND f.retrievedAt <= ${from} AND (f.providerUpdatedAt IS NULL OR f.providerUpdatedAt <= ${from})
    ORDER BY f.kickoff, f.id, h.externalId, a.externalId
    LIMIT ${sampleSize}`);
  const engine = createLiveLocalEngine(database);
  const sample = { fixtures: 0, localCandidates: 0, abstained: 0, readFailures: 0 };
  for (const fixture of new Map(pending.map((row) => [row.id, row])).values()) {
    sample.fixtures++;
    const context = {
      fixtureId: fixture.id, fixtureVersion: fixture.dataVersion, provider: "api-football", externalFixtureId: Number(fixture.externalId),
      home: { teamId: fixture.homeTeamId, externalId: Number(fixture.homeExternalId) },
      away: { teamId: fixture.awayTeamId, externalId: Number(fixture.awayExternalId) },
      kickoffAt: fixture.kickoff.getTime(), analysisAt: now, cutoffAt: now, cycleId: null, runId: null,
    };
    const key = evidenceFingerprint({ purpose: "forecast-coverage", fixtureId: context.fixtureId, at: now });
    try {
      const candidate = await engine({ context, jobId: key, pin: null, evidenceHash: key },
        { aiStatus: "denied", aiReason: "unconfigured" }, () => utcInstantFromEpochMilliseconds(Date.now()), () => {});
      if (candidate) sample.localCandidates++;
      else sample.abstained++;
    } catch {
      sample.readFailures++;
    }
  }
  return { from: from.toISOString(), to: to.toISOString(),
    coverage: Object.fromEntries(Object.entries(coverage).map(([key, value]) => [key, Number(value)])), sample };
}

let database;
try {
  const { values } = parseArgs({ options: { environment: { type: "string", default: "development" },
    sample: { type: "string", default: "12" } } });
  const sampleSize = Number(values.sample);
  if (!/^(?:[1-9]|[12]\d|30)$/u.test(values.sample)) throw new Error("Use a sample between 1 and 30 fixtures.");
  database = await openForecastDatabase(values.environment);
  console.log(JSON.stringify({ environment: values.environment, ...await inspect(database, sampleSize, Date.now()) }));
} catch {
  console.error("Forecast coverage could not be read from the selected database profile.");
  process.exitCode = 1;
} finally {
  await database?.disconnect();
}
