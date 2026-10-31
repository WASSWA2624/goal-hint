import "server-only";

import { randomUUID } from "node:crypto";
import { referralAppealSchema, referralReviewMutationSchema, referralReviewRules, referralReviewStatuses, referralReviewCursor,
  type MemberReferralReview, type ReferralAppeal, type ReferralReviewCase, type ReferralReviewGrant, type ReferralReviewMutation,
  type ReferralReviewOutcome, type ReferralReviewReason, type ReferralReviewStatus } from "../../domain/referral-reviews.ts";
import { normalizePhone } from "../../domain/phone.ts";
import type { AnalyticsConfig } from "../analytics/analytics-config.ts";
import { auditTextErrors } from "../admin/audit.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import type { Prisma, ReferralReviewCase as CaseRow } from "../generated/prisma/client.ts";
import { accessCodeTransaction, createAccessPeriod, lockMemberAccount } from "./access-codes.ts";
import { liveAccessCode, unlockedDeviceLimit } from "./device-grants.ts";
import { isMemberAdminPhone, memberAdminCredential } from "./member-admin.ts";
import type { MemberIdentity } from "./member-sessions.ts";
import { rechainRewardPeriods } from "./referral-periods.ts";

type Tx = Prisma.TransactionClient;
type Key = Pick<AnalyticsConfig, "key">;
const failure = (status: "invalid" | "forbidden" | "not-found" | "conflict") => ({ status } as const);
const unused = (grant: { startsAt: Date; endsAt: Date; revokedAt: Date | null }, at: Date) => grant.revokedAt ? 0 : Math.max(0, +grant.endsAt - Math.max(+grant.startsAt, +at));
/** Supplementary input is bounded and private; obvious personal credentials/addresses must never enter even this store. */
export function safeReferralReviewText(text: string): boolean {
  return !auditTextErrors({ text }) && !/\b(?:otp|password|passcode|bearer|cookie|secret|api[- _]?key)\b/iu.test(text)
    && !/(?<![\dA-Za-z-])\d{6}(?![\dA-Za-z-])|\b(?:\d{1,3}\.){3}\d{1,3}\b|(?:\[|\s|^)[a-f0-9]{0,4}(?::[a-f0-9]{0,4}){3,}(?:\]|\s|$)/iu.test(text);
}

async function lockAccounts(tx: Tx, ids: readonly string[]) {
  for (const id of [...new Set(ids)].sort()) await lockMemberAccount(tx, id);
}

async function referenceForGrant(tx: Tx, grantId: string): Promise<string | null> {
  const visited = new Set<string>();
  let current = grantId;
  for (let depth = 0; depth < 32 && !visited.has(current); depth++) {
    visited.add(current);
    const referral = await tx.memberReferral.findUnique({ where: { accessCodeId: current }, select: { id: true } });
    if (referral) return referral.id;
    const restored = await tx.referralGrantReversal.findUnique({ where: { restoredGrantId: current }, select: { grantId: true } });
    if (!restored) return null;
    current = restored.grantId;
  }
  return null;
}

async function detail(tx: Tx, row: CaseRow): Promise<ReferralReviewCase> {
  const [grant, account, evidence, reversal, events] = await Promise.all([
    tx.accessCode.findUnique({ where: { id: row.grantId }, select: { reference: true, accountId: true } }),
    tx.memberAccount.findUnique({ where: { id: row.accountId }, select: { phone: true } }),
    tx.referralReviewEvidence.findUnique({ where: { caseId: row.id } }),
    tx.referralGrantReversal.findUnique({ where: { caseId: row.id } }),
    tx.referralReviewEvent.findMany({ where: { caseId: row.id }, orderBy: [{ at: "asc" }, { id: "asc" }] }),
  ]);
  const holderId = reversal?.holderAccountId ?? grant?.accountId ?? row.accountId;
  const holder = holderId === row.accountId ? account : await tx.memberAccount.findUnique({ where: { id: holderId }, select: { phone: true } });
  return { id: row.id, grantId: row.grantId, referralId: row.referralId, accountId: row.accountId, phone: account?.phone ?? null,
    holderAccountId: holderId, holderPhone: holder?.phone ?? null,
    reference: grant ? `C-${grant.reference}` : row.grantId, reason: row.reason as ReferralReviewReason, status: row.status as ReferralReviewStatus,
    revision: row.revision, openedAt: row.openedAt.toISOString(), updatedAt: row.updatedAt.toISOString(), closedAt: row.closedAt?.toISOString() ?? null,
    reversedMs: reversal?.reversedMs ?? 0, restoredMs: reversal?.restoredAt ? reversal.reversedMs : 0,
    summary: evidence?.summary ?? null, evidenceRef: evidence?.evidenceRef ?? null, appealStatement: evidence?.appealStatement ?? null,
    evidencePurged: !evidence || !!evidence.purgedAt, events: events.map(event => ({ id: event.id, at: event.at.toISOString(), action: event.action,
      actor: event.actor, beforeMs: event.beforeMs, afterMs: event.afterMs })) };
}

async function memberRow(tx: Tx, row: CaseRow, accountId: string): Promise<MemberReferralReview | null> {
  const [grant, reversal] = await Promise.all([tx.accessCode.findUnique({ where: { id: row.grantId }, select: { accountId: true } }),
    tx.referralGrantReversal.findUnique({ where: { caseId: row.id } })]);
  // The affected holder owns the appeal, including an earned grant legitimately transferred to another number.
  const affected = reversal?.holderAccountId ?? grant?.accountId ?? row.accountId;
  if (affected !== accountId) return null;
  return { id: row.id, reason: row.reason as ReferralReviewReason, status: row.status as ReferralReviewStatus, revision: row.revision,
    openedAt: row.openedAt.toISOString(), updatedAt: row.updatedAt.toISOString(), closedAt: row.closedAt?.toISOString() ?? null,
    reversedMs: reversal?.reversedMs ?? 0, restoredMs: reversal?.restoredAt ? reversal.reversedMs : 0,
    canAppeal: row.status === "reversed" && !!reversal?.reversedMs && !reversal.restoredAt };
}

async function event(tx: Tx, row: CaseRow, action: string, actor: string, at: Date, beforeMs: number | null = null, afterMs: number | null = null) {
  await tx.referralReviewEvent.create({ data: { id: randomUUID(), caseId: row.id, action, actor, at, beforeMs, afterMs } });
}

async function notify(tx: Tx, accountId: string, row: CaseRow, transition: string, kind: "referral-reviewed" | "referral-reversed" | "referral-restored", at: Date) {
  const account = await tx.memberAccount.findUnique({ where: { id: accountId }, select: { phone: true, erasedAt: true } });
  if (!account?.phone || account.erasedAt) return;
  await tx.memberNotification.createMany({ data: [{ id: randomUUID(), accountId, eventKey: `referral-review:${row.id}:${transition}`, kind,
    occurredAt: at, createdAt: at }], skipDuplicates: true });
}

/** Evidence alone is erased; the immutable controlled-code decision/access trail remains, as existing owner accounting does. */
export async function scrubReferralReviewEvidence(tx: Tx, accountId: string) {
  const [cases, grants, reversals, referrals] = await Promise.all([
    tx.referralReviewCase.findMany({ where: { accountId }, select: { id: true } }),
    tx.accessCode.findMany({ where: { accountId }, select: { id: true } }),
    tx.referralGrantReversal.findMany({ where: { OR: [{ accountId }, { holderAccountId: accountId }] }, select: { caseId: true } }),
    tx.memberReferral.findMany({ where: { OR: [{ accountId }, { inviterId: accountId }] }, select: { id: true } }),
  ]);
  const moved = grants.length ? await tx.referralReviewCase.findMany({ where: { grantId: { in: grants.map(grant => grant.id) } }, select: { id: true } }) : [];
  const participating = referrals.length ? await tx.referralReviewCase.findMany({ where: { referralId: { in: referrals.map(row => row.id) } }, select: { id: true } }) : [];
  const ids = [...new Set([...cases.map(row => row.id), ...moved.map(row => row.id), ...reversals.map(row => row.caseId), ...participating.map(row => row.id)])];
  if (ids.length) await tx.referralReviewEvidence.updateMany({ where: { caseId: { in: ids } },
    data: { summary: null, evidenceRef: null, appealStatement: null, purgedAt: new Date() } });
}

export async function purgeReferralReviewEvidence(database: DatabaseRuntime, now = Date.now) {
  const at = new Date(now()), before = new Date(+at - referralReviewRules.evidenceRetentionMs);
  return accessCodeTransaction(database, async tx => {
    const rows = await tx.referralReviewCase.findMany({ where: { closedAt: { lte: before }, evidence: { purgedAt: null } },
      orderBy: { id: "asc" }, take: 250, select: { id: true } });
    let purged = 0;
    for (const row of rows) {
      await tx.$queryRaw`SELECT id FROM ReferralReviewCase WHERE id=${row.id} FOR UPDATE`;
      const current = await tx.referralReviewCase.findUnique({ where: { id: row.id } });
      if (!current?.closedAt || current.closedAt > before) continue;
      const result = await tx.referralReviewEvidence.updateMany({ where: { caseId: row.id, purgedAt: null },
        data: { summary: null, evidenceRef: null, appealStatement: null, purgedAt: at } });
      purged += result.count;
    }
    return { purged };
  });
}

export function createReferralReviews({ database, config, now = Date.now, adminPhone = isMemberAdminPhone, adminCredential = memberAdminCredential }: {
  database: DatabaseRuntime; config: Key; now?: () => number; adminPhone?: (phone: unknown) => boolean; adminCredential?: () => string | null;
}) {
  async function authorized(tx: Tx, member: MemberIdentity, at: Date, administrator: boolean) {
    const [account, session] = await Promise.all([tx.memberAccount.findUnique({ where: { id: member.accountId } }),
      tx.memberSession.findUnique({ where: { tokenHash: member.tokenHash } })]);
    if (member.blocked || !account?.phone || account.phone !== member.phone || account.blockedAt || account.erasedAt || !session?.authenticatedAt
      || session.passwordResetAt || session.accountId !== account.id || session.expiresAt <= at) return false;
    const credential = adminCredential(), admin = adminPhone(account.phone);
    if (administrator) return member.administrator === true && admin && !!credential
      && session.adminPasswordVersion === config.key("admin-password-version", credential);
    return !admin && !!account.passwordHash && !!account.phoneVerifiedAt;
  }
  const save = async (tx: Tx, row: CaseRow) => ({ status: "saved" as const, case: await detail(tx, row) });

  return Object.freeze({
    async list(admin: MemberIdentity, status?: string, before?: string): Promise<readonly ReferralReviewCase[] | null> {
      const selectedStatus = status === "all" ? undefined : status;
      if (selectedStatus && !referralReviewStatuses.includes(selectedStatus as ReferralReviewStatus)) return [];
      const cursor = referralReviewCursor(before);
      if (before && !cursor) return [];
      return accessCodeTransaction(database, async tx => {
        await lockAccounts(tx, [admin.accountId]);
        if (!await authorized(tx, admin, new Date(now()), true)) return null;
        const rows = await tx.referralReviewCase.findMany({ where: { ...(selectedStatus ? { status: selectedStatus } : {}), ...(cursor ? {
          OR: [{ updatedAt: { lt: cursor.at } }, { updatedAt: cursor.at, id: { lt: cursor.id } }] } : {}) },
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: referralReviewRules.pageSize });
        return Promise.all(rows.map(row => detail(tx, row)));
      });
    },
    async detail(admin: MemberIdentity, id: string): Promise<ReferralReviewCase | null> {
      return accessCodeTransaction(database, async tx => {
        await lockAccounts(tx, [admin.accountId]);
        if (!await authorized(tx, admin, new Date(now()), true)) return null;
        const row = await tx.referralReviewCase.findUnique({ where: { id } });
        return row ? detail(tx, row) : null;
      });
    },
    async grants(admin: MemberIdentity, search = ""): Promise<readonly ReferralReviewGrant[] | null> {
      if (search.length > 80) return [];
      return accessCodeTransaction(database, async tx => {
        await lockAccounts(tx, [admin.accountId]);
        const at = new Date(now());
        if (!await authorized(tx, admin, at, true)) return null;
        const phone = normalizePhone(search), accounts = phone ? await tx.memberAccount.findMany({ where: { phone }, select: { id: true } }) : [];
        const grants = await tx.accessCode.findMany({ where: { source: "referral", ...(search ? { OR: [
          { reference: { startsWith: search.replace(/^C-/u, "") } }, ...(accounts.length ? [{ accountId: { in: accounts.map(account => account.id) } }] : [])] } : {}) },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: referralReviewRules.pageSize });
        const result: ReferralReviewGrant[] = [];
        for (const grant of grants) {
          const [referralId, account] = await Promise.all([referenceForGrant(tx, grant.id), tx.memberAccount.findUnique({ where: { id: grant.accountId }, select: { phone: true } })]);
          if (referralId && account?.phone) result.push({ id: grant.id, referralId, accountId: grant.accountId, phone: account.phone,
            reference: `C-${grant.reference}`, startsAt: grant.startsAt.toISOString(), endsAt: grant.endsAt.toISOString(), unusedMs: unused(grant, at) });
        }
        return result;
      });
    },
    async mutate(admin: MemberIdentity, input: ReferralReviewMutation): Promise<ReferralReviewOutcome> {
      const parsed = referralReviewMutationSchema.safeParse(input);
      if (!parsed.success) return failure("invalid");
      const action = parsed.data;
      if (action.action === "create" && (!safeReferralReviewText(action.summary) || !safeReferralReviewText(action.evidenceRef))) return failure("invalid");
      return accessCodeTransaction(database, async tx => {
        if (!await authorized(tx, admin, new Date(now()), true)) return failure("forbidden");
        const initial = action.action === "create" ? null : await tx.referralReviewCase.findUnique({ where: { id: action.id } });
        if (action.action !== "create" && !initial) return failure("not-found");
        const grantId = action.action === "create" ? action.grantId : initial!.grantId;
        const initialGrant = await tx.accessCode.findUnique({ where: { id: grantId } });
        if (!initialGrant) {
          // Account deletion may remove the original period. It must not leave a nonfinancial review uncloseable.
          if (action.action === "create" || action.decision === "confirm" || action.decision === "restore") return failure("not-found");
          await lockAccounts(tx, [admin.accountId, initial!.accountId]);
          const at = new Date(now());
          if (!await authorized(tx, admin, at, true)) return failure("forbidden");
          await tx.$queryRaw`SELECT id FROM ReferralReviewCase WHERE id=${initial!.id} FOR UPDATE`;
          const row = await tx.referralReviewCase.findUniqueOrThrow({ where: { id: initial!.id } });
          const status = action.action === "decide" ? "no-action" : "upheld";
          if (row.status === status) return save(tx, row);
          if (row.status !== (action.action === "decide" ? "open" : "appealed") || row.revision !== action.revision
            || action.decision === "uphold" && !action.evidenceConfirmed) return failure("conflict");
          const ledger = await tx.referralGrantReversal.findUnique({ where: { caseId: row.id } });
          await event(tx, row, action.action === "decide" ? "no-action" : "appeal-upheld", admin.accountId, at, ledger?.reversedMs ?? 0, 0);
          const updated = await tx.referralReviewCase.update({ where: { id: row.id }, data: { status, closedAt: at, updatedAt: at, revision: { increment: 1 } } });
          await notify(tx, ledger?.holderAccountId ?? row.accountId, row, action.action === "decide" ? "reviewed" : "upheld", "referral-reviewed", at);
          return save(tx, updated);
        }
        const initialLedger = await tx.referralGrantReversal.findUnique({ where: { grantId } });
        await lockAccounts(tx, [admin.accountId, initialGrant.accountId, ...(initialLedger ? [initialLedger.holderAccountId] : [])]);
        const at = new Date(now());
        if (!await authorized(tx, admin, at, true)) return failure("forbidden");
        await tx.$queryRaw`SELECT id FROM AccessCode WHERE id=${grantId} FOR UPDATE`;
        const grant = await tx.accessCode.findUnique({ where: { id: grantId } });
        if (!grant || grant.source !== "referral") return failure("invalid");
        if (grant.accountId !== initialGrant.accountId) return failure("conflict");
        if (action.action === "create") {
          const previous = await tx.referralReviewCase.findUnique({ where: { id: action.requestId } });
          if (previous) return previous.grantId === grant.id && previous.reason === action.reason ? save(tx, previous) : failure("conflict");
          const referralId = await referenceForGrant(tx, grant.id), holder = await tx.memberAccount.findUnique({ where: { id: grant.accountId } });
          if (!referralId || !holder?.phone || holder.erasedAt) return failure("not-found");
          const row = await tx.referralReviewCase.create({ data: { id: action.requestId, grantId: grant.id, referralId, accountId: grant.accountId,
            reason: action.reason, status: "open", revision: 1, openedAt: at, updatedAt: at } });
          await tx.referralReviewEvidence.create({ data: { caseId: row.id, summary: action.summary, evidenceRef: action.evidenceRef } });
          await event(tx, row, "requested", admin.accountId, at);
          return save(tx, row);
        }
        await tx.$queryRaw`SELECT id FROM ReferralReviewCase WHERE id=${initial!.id} FOR UPDATE`;
        const row = await tx.referralReviewCase.findUniqueOrThrow({ where: { id: initial!.id } });
        const ledger = await tx.referralGrantReversal.findUnique({ where: { grantId: grant.id } });
        if (ledger && ledger.holderAccountId !== (initialLedger?.holderAccountId ?? grant.accountId)) return failure("conflict");
        if (action.action === "decide" && row.status !== "open") {
          const decided = await tx.referralReviewEvent.findFirst({ where: { caseId: row.id, action: action.decision === "confirm" ? "confirmed" : "no-action" } });
          return decided ? save(tx, row) : failure("conflict");
        }
        if (action.action === "appeal-decision" && row.status !== "appealed") {
          const decided = await tx.referralReviewEvent.findFirst({ where: { caseId: row.id, action: action.decision === "restore" ? "appeal-restored" : "appeal-upheld" } });
          return decided ? save(tx, row) : failure("conflict");
        }
        if (row.revision !== action.revision || !action.evidenceConfirmed && (action.decision === "confirm" || action.decision === "uphold")) return failure("conflict");
        let status: ReferralReviewStatus;
        const closedAt = at;
        const before = unused(grant, at);
        if (action.action === "decide") {
          await event(tx, row, action.decision === "confirm" ? "confirmed" : "no-action", admin.accountId, at, before, before);
          if (action.decision === "no-action" || ledger || before === 0) {
            status = "no-action";
            await notify(tx, grant.accountId, row, "reviewed", "referral-reviewed", at);
          } else {
            await tx.referralGrantReversal.create({ data: { grantId: grant.id, caseId: row.id, accountId: grant.accountId, holderAccountId: grant.accountId, reversedMs: before, appliedAt: at } });
            await tx.accessCode.update({ where: { id: grant.id }, data: { revokedAt: at, revokedReason: "referral-review" } });
            await rechainRewardPeriods(tx, grant.accountId, at);
            const live = await liveAccessCode(tx, grant.accountId, at);
            await tx.memberSession.updateMany({ where: { accountId: grant.accountId, accessCodeId: grant.id },
              data: live ? { accessCodeId: live.id } : { accessCodeId: null, codeEnteredAt: null } });
            await event(tx, row, "reversed", admin.accountId, at, before, 0);
            await notify(tx, grant.accountId, row, "reversed", "referral-reversed", at);
            status = "reversed";
          }
        } else {
          if (!ledger || ledger.caseId !== row.id || !ledger.reversedMs) return failure("conflict");
          const holder = await tx.memberAccount.findUnique({ where: { id: ledger.holderAccountId } });
          if (!holder || action.decision === "restore" && (!holder.phone || holder.erasedAt || holder.blockedAt)) return failure("conflict");
          await event(tx, row, action.decision === "restore" ? "appeal-restored" : "appeal-upheld", admin.accountId, at, ledger.reversedMs, action.decision === "restore" ? ledger.reversedMs : 0);
          if (action.decision === "restore") {
            if (ledger.restoredGrantId) return failure("conflict");
            const compensation = await createAccessPeriod(tx, holder, { source: "referral", planName: "Restored earned access", durationDays: 1,
              priceUgx: 0, amountReceivedUgx: 0 }, `referral-review:${row.id}`, at, { maximum: await unlockedDeviceLimit(tx) }, ledger.reversedMs);
            await tx.referralGrantReversal.update({ where: { grantId: ledger.grantId }, data: { restoredGrantId: compensation.id, restoredAt: at } });
            await rechainRewardPeriods(tx, holder.id, at);
            await event(tx, row, "restored", admin.accountId, at, 0, ledger.reversedMs);
            await notify(tx, holder.id, row, "restored", "referral-restored", at);
            status = "restored";
          } else {
            status = "upheld";
            await notify(tx, holder.id, row, "upheld", "referral-reviewed", at);
          }
        }
        const updated = await tx.referralReviewCase.update({ where: { id: row.id }, data: { status, closedAt, updatedAt: at, revision: { increment: 1 } } });
        return save(tx, updated);
      });
    },
    async member(member: MemberIdentity, before?: string): Promise<readonly MemberReferralReview[] | null> {
      const cursor = referralReviewCursor(before);
      if (before && !cursor) return [];
      return accessCodeTransaction(database, async tx => {
        await lockAccounts(tx, [member.accountId]);
        if (!await authorized(tx, member, new Date(now()), false)) return null;
        const grants = await tx.accessCode.findMany({ where: { accountId: member.accountId, source: "referral" }, select: { id: true } });
        const reversals = await tx.referralGrantReversal.findMany({ where: { holderAccountId: member.accountId }, select: { caseId: true } });
        const transferred = grants.length ? await tx.referralGrantReversal.findMany({ where: { grantId: { in: grants.map(grant => grant.id) }, holderAccountId: { not: member.accountId } }, select: { caseId: true } }) : [];
        const rows = await tx.referralReviewCase.findMany({ where: { AND: [
          { OR: [{ id: { in: reversals.map(row => row.caseId) } }, { grantId: { in: grants.map(grant => grant.id) } }] },
          { id: { notIn: transferred.map(row => row.caseId) } },
          ...(cursor ? [{ OR: [{ updatedAt: { lt: cursor.at } }, { updatedAt: cursor.at, id: { lt: cursor.id } }] }] : []),
        ] }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: referralReviewRules.pageSize });
        const output = await Promise.all(rows.map(row => memberRow(tx, row, member.accountId)));
        return output.filter((row): row is MemberReferralReview => row !== null);
      });
    },
    async appeal(member: MemberIdentity, input: ReferralAppeal) {
      const parsed = referralAppealSchema.safeParse(input);
      if (!parsed.success || !safeReferralReviewText(parsed.data.statement)) return failure("invalid");
      const action = parsed.data;
      return accessCodeTransaction(database, async tx => {
        await lockAccounts(tx, [member.accountId]);
        const at = new Date(now());
        if (!await authorized(tx, member, at, false)) return failure("forbidden");
        await tx.$queryRaw`SELECT id FROM ReferralReviewCase WHERE id=${action.id} FOR UPDATE`;
        const row = await tx.referralReviewCase.findUnique({ where: { id: action.id } });
        if (!row) return failure("not-found");
        const owned = await memberRow(tx, row, member.accountId);
        if (!owned) return failure("forbidden");
        if (["appealed", "upheld", "restored"].includes(row.status)) return { status: "saved" as const, case: owned };
        if (!owned.canAppeal || row.revision !== action.revision) return failure("conflict");
        await tx.referralReviewEvidence.update({ where: { caseId: row.id }, data: { appealStatement: action.statement, purgedAt: null } });
        await event(tx, row, "appealed", member.accountId, at);
        const updated = await tx.referralReviewCase.update({ where: { id: row.id }, data: { status: "appealed", closedAt: null, updatedAt: at, revision: { increment: 1 } } });
        await notify(tx, member.accountId, row, "appealed", "referral-reviewed", at);
        return { status: "saved" as const, case: (await memberRow(tx, updated, member.accountId))! };
      });
    },
    async purgeEvidence() { return purgeReferralReviewEvidence(database, now); },
  });
}
export type ReferralReviews = ReturnType<typeof createReferralReviews>;
