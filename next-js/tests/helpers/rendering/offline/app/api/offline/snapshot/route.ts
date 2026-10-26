import { getReportingDate, utcInstantFromEpochMilliseconds } from "@/domain/calendar";
import { offlineRules, offlineSnapshotSchema } from "@/domain/offline";

export const dynamic = "force-dynamic";
export async function GET() {
  const capturedAt = utcInstantFromEpochMilliseconds(Date.now());
  const body = offlineSnapshotSchema.parse({ schemaVersion: 1, capturedAt,
    expiresAt: capturedAt + offlineRules.retentionMs, reportingDate: getReportingDate(capturedAt),
    records: [{ fixtureId: "offline-public-1", dataVersion: "1",
      homeTeam: { id: "home", name: "Saved Home United", code: "SHU" },
      awayTeam: { id: "away", name: "Saved Away City", code: "SAC" },
      competition: { id: "offline-league", name: "Saved public league", country: "Uganda" },
      kickoffAt: capturedAt, syncedAt: capturedAt, status: "finished-regulation", score: { home: 2, away: 1 }, scorePeriod: "regulation" }] });
  return Response.json(body, { headers: { "cache-control": "public, max-age=0, must-revalidate", "x-goalhint-offline-snapshot": "1" } });
}
