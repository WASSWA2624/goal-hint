import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { savedSlipCompleted, savedSlipSnapshotSchema } from "../../domain/saved-slips.ts";
import { modelIndependentSlip, type BuiltSlip } from "../../domain/slip-builder.ts";
import { sharedSlipIdSchema, sharedSlipRules, sharedSlipSchema, sharedSlipUrl, type SharedSlip } from "../../domain/shared-slips.ts";
import type { AnalyticsConfig } from "../analytics/analytics-config.ts";
import { getAnalyticsServices } from "../analytics/analytics-http.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { lockMemberAccount } from "../members/access-codes.ts";
import type { MemberIdentity } from "../members/member-sessions.ts";
import { takeMemberLimit } from "../members/rate-limit.ts";
import { assertHistorySeal, historyJson } from "../predictions/history-read.ts";
import { bindSlipForecasts } from "./slip-forecast.ts";
import { readSlipForecastResults } from "./slip-forecast.ts";
import { readWithSlipAccess } from "./slip-access.ts";
import type { ViewerAccess } from "../members/viewer-access.ts";

export type SharedSlipLanding = Readonly<{ state: "available"; shared: SharedSlip }> | Readonly<{ state: "restricted" | "missing" }>;
type Row = { id: string; createdAt: Date; snapshotJson: unknown; validIntegrity: unknown };
export type SharedSlipWrite = Readonly<{ state: "shared"; shared: SharedSlip }> | Readonly<{ state: "forbidden" | "busy" | "changed" | "too-large" }>;

function publicRecord(row: Row): SharedSlip {
  assertHistorySeal(row.validIntegrity);
  return sharedSlipSchema.parse({ id: row.id, url: sharedSlipUrl(row.id), createdAt: row.createdAt.toISOString(),
    slip: savedSlipSnapshotSchema.parse(historyJson(row.snapshotJson)) });
}

/** Sharing is explicit publication. Only a random public token and immutable snapshot leave this service. */
export function createSharedSlips(database: DatabaseRuntime, config: Pick<AnalyticsConfig, "key">, now = Date.now,
  { bindForecasts = bindSlipForecasts, resolveResults = readSlipForecastResults, identity = () => randomBytes(16).toString("hex") } = {}) {
  return Object.freeze({
    async publish(member: MemberIdentity, input: BuiltSlip, source: "builder" | "best"): Promise<SharedSlipWrite> {
      const proposed = savedSlipSnapshotSchema.parse(modelIndependentSlip(input)) as BuiltSlip;
      return database.transaction(async (tx) => {
        const at = new Date(now()), account = await lockMemberAccount(tx, member.accountId);
        const session = await tx.memberSession.findUnique({ where: { tokenHash: member.tokenHash } });
        if (!account?.phone || account.blockedAt || account.erasedAt || !session?.authenticatedAt || session.passwordResetAt
          || session.accountId !== account.id || session.expiresAt <= at) return { state: "forbidden" };
        const entitled = member.administrator || session.codeEnteredAt && await tx.accessCode.findFirst({
          where: { accountId: account.id, revokedAt: null, startsAt: { lte: at }, endsAt: { gt: at } }, select: { id: true },
        });
        if (!entitled) return { state: "forbidden" };
        // The API obtains editorial snapshots from the sealed publication store. A rebuilt custom slip
        // is bound again under shared fixture locks, so a cutoff/change cannot race its public creation.
        const bound = source === "builder" ? await bindForecasts(tx, proposed, +at) : proposed;
        if (!bound) return { state: "changed" };
        const snapshot = savedSlipSnapshotSchema.parse(bound), json = JSON.stringify(snapshot);
        if (Buffer.byteLength(json, "utf8") > sharedSlipRules.maximumSnapshotBytes) return { state: "too-large" };
        const ownerKey = config.key("shared-slip-owner", account.id);
        const fingerprint = createHash("sha256").update(json).digest("hex");
        const existing = await tx.$queryRaw<Row[]>`SELECT id,createdAt,snapshotJson,
          integrity=SHA2(CAST(snapshotJson AS CHAR),256) AS validIntegrity FROM SharedSlip
          WHERE ownerKey=${ownerKey} AND fingerprint=${fingerprint} LIMIT 1`;
        if (existing[0]) return { state: "shared", shared: publicRecord(existing[0]) };
        if (!await takeMemberLimit(tx, config, { purpose: "share-slip", value: account.id,
          maximum: sharedSlipRules.maximumNewSharesPerHour, windowMs: 3_600_000 }, at)) return { state: "busy" };
        const id = sharedSlipIdSchema.parse(identity());
        // There is no UPDATE path or privilege. Account locking serializes same-member deduplication.
        await tx.$executeRaw`INSERT INTO SharedSlip (id,ownerKey,fingerprint,snapshotJson,integrity,createdAt)
          VALUES (${id},${ownerKey},${fingerprint},JSON_EXTRACT(${json},'$'),SHA2(CAST(JSON_EXTRACT(${json},'$') AS CHAR),256),${at})`;
        return { state: "shared", shared: publicRecord({ id, createdAt: at, snapshotJson: snapshot, validIntegrity: 1 }) };
      }, { isolationLevel: "ReadCommitted", timeout: 30_000 });
    },
    async read(id: string, entitled = false): Promise<SharedSlip | null> {
      const result = await this.landing(id, entitled);
      return result.state === "available" ? result.shared : null;
    },
    async landing(id: string, entitled = false): Promise<SharedSlipLanding> {
      if (!sharedSlipIdSchema.safeParse(id).success) return { state: "missing" };
      return database.transaction(async (tx) => {
        const rows = await tx.$queryRaw<Row[]>`SELECT id,createdAt,snapshotJson,
          integrity=SHA2(CAST(snapshotJson AS CHAR),256) AS validIntegrity FROM SharedSlip WHERE id=${id} LIMIT 1`;
        if (!rows[0]) return { state: "missing" } as const;
        const shared = publicRecord(rows[0]);
        if (!entitled && !savedSlipCompleted(shared.slip, await resolveResults(tx, shared.slip.selections, now()))) return { state: "restricted" } as const;
        return { state: "available", shared } as const;
      }, { isolationLevel: "RepeatableRead", timeout: 30_000 });
    },
  });
}

export async function readSharedSlip(id: string, access?: ViewerAccess): Promise<SharedSlip | null> {
  if (!sharedSlipIdSchema.safeParse(id).success) return null;
  const { database, config } = await getAnalyticsServices();
  if (!database) throw new Error("Shared slip storage is unavailable.");
  const read = (viewer: ViewerAccess) => createSharedSlips(database, config).read(id, viewer.tier === "full");
  return access ? read(access) : readWithSlipAccess(read);
}

/** Restricted results expose only a state, never a snapshot or aggregate selection facts. */
export async function readSharedSlipLanding(id: string): Promise<{ result: SharedSlipLanding; access: ViewerAccess }> {
  if (!sharedSlipIdSchema.safeParse(id).success) return { result: { state: "missing" }, access: { tier: "free", signedIn: false, mode: "free" } };
  const { database, config } = await getAnalyticsServices();
  if (!database) throw new Error("Shared slip storage is unavailable.");
  return readWithSlipAccess(async access => ({ access, result: await createSharedSlips(database, config).landing(id, access.tier === "full") }));
}
