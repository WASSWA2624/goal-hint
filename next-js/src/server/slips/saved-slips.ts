import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { savedSlipCompleted, savedSlipCompletedStatuses, savedSlipOutcome, savedSlipSnapshotSchema, savedSlipView, type SavedSlipHistory, type SavedSlipHistoryQuery, type SavedSlipView } from "../../domain/saved-slips.ts";
import { slipBuilderRules, type BuiltSlip } from "../../domain/slip-builder.ts";
import { addReportingDays, getReportingDate, utcInstantFromEpochMilliseconds, validateReportingDateRange } from "../../domain/calendar.ts";
import { isDevelopmentDemo } from "../../domain/development-demo.ts";
import { fullDayKickoffTime, kickoffTimeWindows } from "../../domain/kickoff-time.ts";
import { publicPolicy } from "../../domain/public-policy.ts";
import { getAnalyticsServices } from "../analytics/analytics-http.ts";
import type { AnalyticsConfig } from "../analytics/analytics-config.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { lockMemberAccount } from "../members/access-codes.ts";
import type { MemberIdentity } from "../members/member-sessions.ts";
import { takeMemberLimit } from "../members/rate-limit.ts";
import { bindSlipForecasts, readSlipForecastResults, slipForecastReadRules } from "./slip-forecast.ts";
import { readWithSlipAccess } from "./slip-access.ts";

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
    async completed(completedOnly = false): Promise<readonly SavedSlipView[]> {
      // Filter original-cycle eligibility before the LIMIT, so newer active saves cannot hide older completed saves.
      return database.transaction(async (tx) => {
        const asOf = now(), terminal = Prisma.join([...savedSlipCompletedStatuses]);
        type Row = { id: string; createdAt: Date; snapshotJson: unknown };
        const records: SavedSlipView[] = [];
        let cursor: Row | null = null;
        for (;;) {
          const after = cursor ? Prisma.sql`AND (s.createdAt<${cursor.createdAt} OR (s.createdAt=${cursor.createdAt} AND s.id<${cursor.id}))` : Prisma.empty;
          const rows: Row[] = await tx.$queryRaw<Row[]>(Prisma.sql`
            SELECT s.id, s.createdAt, s.snapshotJson FROM SavedSlip s
            WHERE EXISTS (SELECT 1 FROM SavedSlipFixture sf WHERE sf.slipId=s.id)
              -- A scalar count retains per-slip JSON_TABLE correlation across query
              -- plans, with every original-cycle exclusion evaluated before LIMIT.
              AND 0 = (
                SELECT COUNT(*) FROM JSON_TABLE(s.snapshotJson, '$.selections[*]' COLUMNS (
                  fixtureId CHAR(36) PATH '$.fixtureId', family VARCHAR(32) PATH '$.family',
                  cycleId CHAR(36) PATH '$.forecast.cycleId' NULL ON EMPTY,
                  publishedAt BIGINT PATH '$.forecast.publishedAt' NULL ON EMPTY
                )) leg
                LEFT JOIN FootballFixture f ON f.id=leg.fixtureId
                LEFT JOIN PredictionCycle c ON c.id=leg.cycleId AND c.fixtureId=leg.fixtureId
                WHERE f.id IS NULL OR ${completedOnly ? Prisma.sql`f.status NOT IN (${terminal}) OR` : Prisma.empty} CASE
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
              ) ${after}
            ORDER BY s.createdAt DESC, s.id DESC LIMIT 20`);
          const parsed = rows.flatMap((row) => {
            const value = savedSlipSnapshotSchema.safeParse(row.snapshotJson);
            return value.success ? [{ ...row, slip: value.data as BuiltSlip }] : [];
          });
          const results = await resolveResults(tx, parsed.flatMap((row) => row.slip.selections), asOf);
          for (const row of parsed) {
            if (completedOnly && !savedSlipCompleted(row.slip, results)) continue;
            const view = savedSlipView(row.id, row.createdAt.toISOString(), row.slip, results);
            if (view) records.push(view);
            if (records.length === 20) return records;
          }
          if (rows.length < 20) return records;
          cursor = rows.at(-1)!;
        }
      }, { isolationLevel: "RepeatableRead", timeout: 10_000 });
    },
    async history(query: SavedSlipHistoryQuery, completedOnly = false): Promise<SavedSlipHistory> {
      const range = validateReportingDateRange(query.dateFrom, query.dateTo, slipBuilderRules.maximumDays);
      const windows = kickoffTimeWindows(range, { from: query.timeFrom || fullDayKickoffTime.from,
        to: query.timeTo || fullDayKickoffTime.to, zone: publicPolicy.reportingTimeZone });
      const kickoffMatches = Prisma.join(windows.map((window) => Prisma.sql`(leg.kickoffAt>=${window.start} AND leg.kickoffAt<${window.end})`), " OR ");
      return database.transaction(async (tx) => {
        const asOf = now(), records: SavedSlipView[] = [];
        const statistics = { total: 0, won: 0, lost: 0, pending: 0, void: 0 };
        const batchSize = Math.min(100, Math.floor(slipForecastReadRules.maximumSelections / slipBuilderRules.maximumSelections));
        type Row = { id: string; createdAt: Date; snapshotJson: unknown };
        let cursor: Pick<Row, "id" | "createdAt"> | null = null;
        // Keyset batches bound forecast hydration while the repeatable-read snapshot keeps counts coherent.
        for (;;) {
          const after: Prisma.Sql = cursor ? Prisma.sql`AND (s.createdAt<${cursor.createdAt} OR (s.createdAt=${cursor.createdAt} AND s.id<${cursor.id}))` : Prisma.empty;
          const rows: Row[] = await tx.$queryRaw<Row[]>(Prisma.sql`
            SELECT s.id, s.createdAt, s.snapshotJson FROM SavedSlip s
            WHERE s.createdAt<=${new Date(asOf)}
              AND JSON_LENGTH(s.snapshotJson,'$.selections')>0
              AND 0 = (SELECT COUNT(*) FROM JSON_TABLE(s.snapshotJson, '$.selections[*]' COLUMNS (
                kickoffAt BIGINT PATH '$.kickoffAt' NULL ON EMPTY
              )) leg WHERE NOT COALESCE((${kickoffMatches}),FALSE))
              ${after}
            ORDER BY s.createdAt DESC, s.id DESC LIMIT ${batchSize}`);
          const parsed = rows.map((row) => ({ ...row, slip: savedSlipSnapshotSchema.parse(row.snapshotJson) as BuiltSlip }));
          const results = await resolveResults(tx, parsed.flatMap((row) => row.slip.selections), asOf);
          for (const row of parsed) {
            if (completedOnly && !savedSlipCompleted(row.slip, results)) continue;
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
    if (database && isDevelopmentDemo()) {
      const { ensureDemoSlipDates } = await import("../demo/slips-seed.ts");
      const today = getReportingDate(utcInstantFromEpochMilliseconds(Date.now()));
      await ensureDemoSlipDates(database, [addReportingDays(today, -1), addReportingDays(today, -2)]);
    }
    return database ? await readWithSlipAccess((viewer) => createSavedSlips(database, config).completed(viewer.tier === "free")) : null;
  } catch { return null; }
}

export async function readSavedSlipHistory(query: SavedSlipHistoryQuery): Promise<SavedSlipHistory | null> {
  try {
    const { database, config } = await getAnalyticsServices();
    if (database && isDevelopmentDemo()) {
      const range = validateReportingDateRange(query.dateFrom, query.dateTo, slipBuilderRules.maximumDays);
      const { ensureDemoSlipDates } = await import("../demo/slips-seed.ts");
      await ensureDemoSlipDates(database, Array.from({ length: range.dayCount }, (_, index) => addReportingDays(range.startDate, index)));
    }
    return database ? await readWithSlipAccess((viewer) => createSavedSlips(database, config).history(query, viewer.tier === "free")) : null;
  } catch { return null; }
}
