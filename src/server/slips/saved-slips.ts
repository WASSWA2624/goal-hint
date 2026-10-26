import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { savedSlipCompletedStatuses, savedSlipOutcome, savedSlipSnapshotSchema, savedSlipView, type SavedSlipHistory, type SavedSlipHistoryQuery, type SavedSlipView } from "../../domain/saved-slips.ts";
import { slipBuilderRules, type BuiltSlip } from "../../domain/slip-builder.ts";
import { validateReportingDateRange } from "../../domain/calendar.ts";
import { fullDayKickoffTime, kickoffTimeWindows } from "../../domain/kickoff-time.ts";
import { publicPolicy } from "../../domain/public-policy.ts";
import { getAnalyticsServices } from "../analytics/analytics-http.ts";
import type { AnalyticsConfig } from "../analytics/analytics-config.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { lockMemberAccount } from "../members/access-codes.ts";
import type { MemberIdentity } from "../members/member-sessions.ts";
import { takeMemberLimit } from "../members/rate-limit.ts";
import { bindSlipForecasts, readSlipForecastResults } from "./slip-forecast.ts";

export function createSavedSlips(database: DatabaseRuntime, config: Pick<AnalyticsConfig, "key">, now = Date.now,
  { resolveResults = readSlipForecastResults }: { resolveResults?: typeof readSlipForecastResults } = {}) {
  return {
    async save(member: MemberIdentity, input: BuiltSlip): Promise<"saved" | "forbidden" | "busy" | "changed"> {
      const snapshot = savedSlipSnapshotSchema.parse(input), at = new Date(now());
      if (snapshot.selections.some((item) => item.kickoffAt <= +at)) return "forbidden";
      return database.transaction(async (tx) => {
        const account = await lockMemberAccount(tx, member.accountId);
        const session = await tx.memberSession.findUnique({ where: { tokenHash: member.tokenHash } });
        if (!account?.phone || account.blockedAt || account.erasedAt || !session?.authenticatedAt || session.passwordResetAt
          || session.accountId !== account.id || session.expiresAt <= at) return "forbidden";
        const entitled = member.administrator || session.codeEnteredAt && await tx.accessCode.findFirst({
          where: { accountId: account.id, revokedAt: null, startsAt: { lte: at }, endsAt: { gt: at } }, select: { id: true },
        });
        if (!entitled) return "forbidden";
        const bound = await bindSlipForecasts(tx, snapshot as BuiltSlip, +at);
        if (!bound) return "changed";
        const fingerprint = createHash("sha256").update(JSON.stringify(bound)).digest("hex");
        if (!await takeMemberLimit(tx, config, { purpose: "save-slip", value: account.id, maximum: 30, windowMs: 3_600_000 }, at)) return "busy";
        await tx.savedSlip.upsert({ where: { accountId_fingerprint: { accountId: account.id, fingerprint } }, update: {},
          create: { id: randomUUID(), accountId: account.id, fingerprint, snapshotJson: bound as unknown as Prisma.InputJsonValue, createdAt: at,
            selections: { create: bound.selections.map((item) => ({ fixtureId: item.fixtureId })) } } });
        return "saved";
      }, { isolationLevel: "ReadCommitted", timeout: 10_000 });
    },
    async completed(): Promise<readonly SavedSlipView[]> {
      // Filter original-cycle eligibility before the LIMIT, so newer active saves cannot hide older completed saves.
      return database.transaction(async (tx) => {
        const asOf = now(), terminal = Prisma.join([...savedSlipCompletedStatuses]);
        const rows = await tx.$queryRaw<{ id: string; createdAt: Date; snapshotJson: unknown }[]>(Prisma.sql`
          SELECT s.id, s.createdAt, s.snapshotJson FROM SavedSlip s
          WHERE EXISTS (SELECT 1 FROM SavedSlipFixture sf WHERE sf.slipId=s.id)
            AND NOT EXISTS (
              SELECT 1 FROM JSON_TABLE(s.snapshotJson, '$.selections[*]' COLUMNS (
                fixtureId CHAR(36) PATH '$.fixtureId', family VARCHAR(32) PATH '$.family',
                cycleId CHAR(36) PATH '$.forecast.cycleId' NULL ON EMPTY,
                publishedAt BIGINT PATH '$.forecast.publishedAt' NULL ON EMPTY
              )) leg
              LEFT JOIN FootballFixture f ON f.id=leg.fixtureId
              LEFT JOIN PredictionCycle c ON c.id=leg.cycleId AND c.fixtureId=leg.fixtureId
              WHERE f.id IS NULL OR CASE
                WHEN leg.cycleId IS NULL THEN f.status NOT IN (${terminal})
                WHEN c.id IS NULL OR c.state='open' THEN TRUE
                WHEN c.state='void' THEN c.voidedAt IS NULL OR c.voidedAt>${new Date(asOf)}
                WHEN c.state='closed' THEN c.closedAt IS NULL OR c.closedAt>${new Date(asOf)} OR
                  (c.lockedSetId IS NOT NULL AND leg.publishedAt*1000<TIMESTAMPDIFF(MICROSECOND,'1970-01-01 00:00:00',LEAST(c.cutoffAt,c.closedAt)) AND CASE
                    WHEN f.activeCycleId IS NULL OR f.activeCycleId=c.id THEN f.status NOT IN (${terminal})
                    ELSE NOT EXISTS (
                      SELECT 1 FROM MarketSettlementRevision r WHERE r.cycleId=c.id AND r.fixtureId=f.id
                        AND r.family=leg.family AND JSON_UNQUOTE(JSON_EXTRACT(r.body,'$.status')) IN ('correct','incorrect','void')
                        AND r.at<=${new Date(asOf)}
                    ) END)
                ELSE TRUE END
            )
          ORDER BY s.createdAt DESC, s.id DESC LIMIT 20`);
        const parsed = rows.flatMap((row) => {
          const value = savedSlipSnapshotSchema.safeParse(row.snapshotJson);
          return value.success ? [{ ...row, slip: value.data as BuiltSlip }] : [];
        });
        const results = await resolveResults(tx, parsed.flatMap((row) => row.slip.selections), asOf);
        return parsed.flatMap((row) => {
          const view = savedSlipView(row.id, row.createdAt.toISOString(), row.slip, results);
          return view ? [view] : [];
        });
      }, { isolationLevel: "RepeatableRead", timeout: 10_000 });
    },
    async history(query: SavedSlipHistoryQuery): Promise<SavedSlipHistory> {
      const range = validateReportingDateRange(query.dateFrom, query.dateTo, slipBuilderRules.maximumDays);
      const windows = kickoffTimeWindows(range, { from: query.timeFrom || fullDayKickoffTime.from,
        to: query.timeTo || fullDayKickoffTime.to, zone: publicPolicy.reportingTimeZone });
      const kickoffMatches = Prisma.join(windows.map((window) => Prisma.sql`(leg.kickoffAt>=${window.start} AND leg.kickoffAt<${window.end})`), " OR ");
      return database.transaction(async (tx) => {
        const asOf = now(), records: SavedSlipView[] = [];
        const statistics = { total: 0, won: 0, lost: 0, pending: 0, void: 0 };
        const batchSize = 100;
        type Row = { id: string; createdAt: Date; snapshotJson: unknown };
        let cursor: Pick<Row, "id" | "createdAt"> | null = null;
        // Keyset batches bound forecast hydration while the repeatable-read snapshot keeps counts coherent.
        for (;;) {
          const after: Prisma.Sql = cursor ? Prisma.sql`AND (s.createdAt<${cursor.createdAt} OR (s.createdAt=${cursor.createdAt} AND s.id<${cursor.id}))` : Prisma.empty;
          const rows: Row[] = await tx.$queryRaw<Row[]>(Prisma.sql`
            SELECT s.id, s.createdAt, s.snapshotJson FROM SavedSlip s
            WHERE s.createdAt<=${new Date(asOf)}
              AND JSON_LENGTH(s.snapshotJson,'$.selections')>0
              AND NOT EXISTS (SELECT 1 FROM JSON_TABLE(s.snapshotJson, '$.selections[*]' COLUMNS (
                kickoffAt BIGINT PATH '$.kickoffAt' NULL ON EMPTY
              )) leg WHERE NOT COALESCE((${kickoffMatches}),FALSE))
              ${after}
            ORDER BY s.createdAt DESC, s.id DESC LIMIT ${batchSize}`);
          const parsed = rows.map((row) => ({ ...row, slip: savedSlipSnapshotSchema.parse(row.snapshotJson) as BuiltSlip }));
          const results = await resolveResults(tx, parsed.flatMap((row) => row.slip.selections), asOf);
          for (const row of parsed) {
            const view = savedSlipView(row.id, row.createdAt.toISOString(), row.slip, results);
            statistics.total++; statistics[view?.outcome ?? savedSlipOutcome(row.slip, results)]++;
            if (view && records.length < 20) records.push(view);
          }
          if (rows.length < batchSize) break;
          cursor = rows.at(-1)!;
        }
        return { asOf, records, statistics };
      }, { isolationLevel: "RepeatableRead", timeout: 30_000 });
    },
  };
}

export async function readCompletedSlips(): Promise<readonly SavedSlipView[] | null> {
  try {
    const { database, config } = await getAnalyticsServices();
    return database ? await createSavedSlips(database, config).completed() : null;
  } catch { return null; }
}

export async function readSavedSlipHistory(query: SavedSlipHistoryQuery): Promise<SavedSlipHistory | null> {
  try {
    const { database, config } = await getAnalyticsServices();
    return database ? await createSavedSlips(database, config).history(query) : null;
  } catch { return null; }
}
