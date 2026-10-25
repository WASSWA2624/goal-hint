import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { savedSlipCompletedStatuses, savedSlipSnapshotSchema, savedSlipView, type SavedSlipView } from "../../domain/saved-slips.ts";
import { type BuiltSlip } from "../../domain/slip-builder.ts";
import { getAnalyticsServices } from "../analytics/analytics-http.ts";
import type { AnalyticsConfig } from "../analytics/analytics-config.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { lockMemberAccount } from "../members/access-codes.ts";
import type { MemberIdentity } from "../members/member-sessions.ts";
import { takeMemberLimit } from "../members/rate-limit.ts";
import type { HistoryRow } from "../predictions/history-read.ts";
import { fixtureResultFromRow, fixtureResultMatchesCanonical } from "../results/result-read.ts";

export function createSavedSlips(database: DatabaseRuntime, config: Pick<AnalyticsConfig, "key">, now = Date.now) {
  return {
    async save(member: MemberIdentity, input: BuiltSlip): Promise<"saved" | "forbidden" | "busy"> {
      const snapshot = savedSlipSnapshotSchema.parse(input), at = new Date(now());
      if (snapshot.selections.some((item) => item.kickoffAt <= +at)) return "forbidden";
      const fingerprint = createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
      return database.transaction(async (tx) => {
        const account = await lockMemberAccount(tx, member.accountId);
        const session = await tx.memberSession.findUnique({ where: { tokenHash: member.tokenHash } });
        if (!account?.phone || account.blockedAt || account.erasedAt || !session?.authenticatedAt || session.passwordResetAt
          || session.accountId !== account.id || session.expiresAt <= at) return "forbidden";
        const entitled = member.administrator || session.codeEnteredAt && await tx.accessCode.findFirst({
          where: { accountId: account.id, revokedAt: null, startsAt: { lte: at }, endsAt: { gt: at } }, select: { id: true },
        });
        if (!entitled) return "forbidden";
        if (!await takeMemberLimit(tx, config, { purpose: "save-slip", value: account.id, maximum: 30, windowMs: 3_600_000 }, at)) return "busy";
        await tx.savedSlip.upsert({ where: { accountId_fingerprint: { accountId: account.id, fingerprint } }, update: {},
          create: { id: randomUUID(), accountId: account.id, fingerprint, snapshotJson: snapshot as unknown as Prisma.InputJsonValue, createdAt: at,
            selections: { create: snapshot.selections.map((item) => ({ fixtureId: item.fixtureId })) } } });
        return "saved";
      }, { isolationLevel: "ReadCommitted", timeout: 10_000 });
    },
    async completed(): Promise<readonly SavedSlipView[]> {
      // The relation predicate excludes every active leg before snapshots leave storage.
      return database.transaction(async (tx) => {
        const rows = await tx.savedSlip.findMany({ where: { selections: { some: {}, every: { fixture: { status: { in: [...savedSlipCompletedStatuses] } } } } },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 20,
          select: { id: true, createdAt: true, snapshotJson: true, selections: { select: { fixtureId: true, fixture: {
            select: { status: true, regulationHome: true, regulationAway: true, regulationVerifiedAt: true, regulationEvidenceRef: true,
              lifecycleState: { select: { issue: true } }, resultState: { select: { resultId: true } } },
          } } } } });
        const resultIds = [...new Set(rows.flatMap((row) => row.selections.flatMap((item) => item.fixture.resultState?.resultId ? [item.fixture.resultState.resultId] : [])))];
        const resultRows = resultIds.length ? await tx.$queryRaw<HistoryRow[]>(Prisma.sql`SELECT *, integrity=SHA2(CAST(body AS CHAR),256) AS validIntegrity
          FROM FixtureResult WHERE id IN (${Prisma.join(resultIds)})`) : [];
        const resultsById = new Map(resultRows.map((row) => { const result = fixtureResultFromRow(row); return [result.id, result]; }));
        return rows.flatMap((row) => {
          const results = row.selections.map((item) => {
            const result = resultsById.get(item.fixture.resultState?.resultId ?? "") ?? null;
            const coherent = result?.fixtureId === item.fixtureId && fixtureResultMatchesCanonical(item.fixture, result, item.fixture.lifecycleState?.issue ?? null);
            return { fixtureId: item.fixtureId, status: item.fixture.status,
              regulationVerified: Boolean(coherent && result?.regulation.verified),
              regulationHome: coherent ? result?.regulation.home ?? null : null, regulationAway: coherent ? result?.regulation.away ?? null : null };
          });
          const view = savedSlipView(row.id, row.createdAt.toISOString(), row.snapshotJson, results as Parameters<typeof savedSlipView>[3]);
          return view ? [view] : [];
        });
      }, { isolationLevel: "RepeatableRead", timeout: 10_000 });
    },
  };
}

export async function readCompletedSlips(): Promise<readonly SavedSlipView[] | null> {
  try {
    const { database, config } = await getAnalyticsServices();
    return database ? await createSavedSlips(database, config).completed() : null;
  } catch { return null; }
}
