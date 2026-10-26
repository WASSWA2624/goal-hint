import { z } from "zod";
import { getReportingDate, parseReportingDate, utcInstantFromEpochMilliseconds } from "./calendar.ts";
import { fixtureSnapshotSchema, type FixtureSnapshot } from "./fixture-snapshot.ts";
import { publicPolicy } from "./public-policy.ts";
import { offlineRules } from "./offline-rules.ts";
export { offlineRules } from "./offline-rules.ts";

/** Anonymous, bounded content only. Browser profiles and session cookies are separate. */

const fixture = fixtureSnapshotSchema.shape;
const team = z.strictObject({ id: fixture.homeTeam.shape.id, name: fixture.homeTeam.shape.name,
  code: fixture.homeTeam.shape.code.default(null) });

/** An explicit allowlist; predictions, identities and third-party media have no representation here. */
export const offlineRecordSchema = z.strictObject({
  fixtureId: fixture.fixtureId, dataVersion: fixture.dataVersion,
  homeTeam: team, awayTeam: team,
  competition: z.strictObject({ id: fixture.competition.shape.id, name: fixture.competition.shape.name,
    country: fixture.competition.shape.country }),
  kickoffAt: fixture.kickoffAt, syncedAt: fixture.syncedAt, status: fixture.status, score: fixture.score,
  scorePeriod: fixture.scorePeriod.default(null),
});

const instant = z.number().int().nonnegative().max(8_640_000_000_000_000).transform(utcInstantFromEpochMilliseconds);
const reportingDate = z.string().transform((value, context) => {
  try { return parseReportingDate(value); }
  catch { context.addIssue({ code: "custom", message: "Invalid reporting date." }); return z.NEVER; }
});

export const offlineSnapshotSchema = z.strictObject({ schemaVersion: z.literal(1), capturedAt: instant, expiresAt: instant,
  reportingDate, records: z.array(offlineRecordSchema).max(offlineRules.maximumRecords),
}).refine((value) => {
  try {
    return value.expiresAt > value.capturedAt && value.expiresAt - value.capturedAt <= offlineRules.retentionMs
      && value.reportingDate === getReportingDate(value.capturedAt)
      && new Set(value.records.map((record) => record.fixtureId)).size === value.records.length;
  } catch { return false; }
},
"Invalid anonymous snapshot lifetime, date or fixture identities.");

export type OfflineRecord = z.infer<typeof offlineRecordSchema>;
export type OfflineSnapshot = z.infer<typeof offlineSnapshotSchema>;

/** Reuse the web card without fabricating a prediction or an entitlement. */
export function offlineFixture(record: OfflineRecord): FixtureSnapshot {
  return fixtureSnapshotSchema.parse({ ...offlineRecordSchema.parse(record), forecast: null, prices: [], cycleId: null,
    unavailableMarkets: publicPolicy.markets.map((family) => ({ family, reason: "not-published" })),
    update: { prediction: "unavailable", result: "untracked" } });
}
