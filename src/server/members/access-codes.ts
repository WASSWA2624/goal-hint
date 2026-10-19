import "server-only";

import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { accessCodeAlphabet, extractCode, formatCode, normalizeCode } from "../../domain/access-code.ts";
import { transactionKey } from "../../domain/payment.ts";
import { normalizePhone } from "../../domain/phone.ts";
import { chainPeriods, codeStatus, extendPeriods, remainingDays, subscriptionDayMs } from "../../domain/subscription-period.ts";
import { auditTextErrors, writeOwnerAudit, type OwnerAuditAction } from "../admin/audit.ts";
import type { AnalyticsConfig } from "../analytics/analytics-config.ts";
import { DatabaseOperationError, type DatabaseRuntime } from "../database/client.ts";
import type { AccessCode, MemberSession, Prisma } from "../generated/prisma/client.ts";
import { issueMemberSession, memberSessionRules, memberTokenHash, type MemberIdentity } from "./member-sessions.ts";
import { createMemberRateLimit, memberRateRules, takeMemberLimit } from "./rate-limit.ts";
import { decide, lockSettings } from "./settings.ts";

export const generateCode = () => Array.from({ length: 12 }, () => accessCodeAlphabet[randomInt(32)]).join("");
export const newSalt = () => randomBytes(16);
export function hashCode(salt: Uint8Array, code: string): string {
  const normalized = normalizeCode(code);
  if (salt.length !== 16 || !normalized) throw new RangeError("A salt and valid code are required.");
  return createHash("sha256").update("goal-hint-access-code:v1:").update(salt).update(normalized).digest("hex");
}
export const newReference = () => `C-${Array.from({ length: 4 }, () => accessCodeAlphabet[randomInt(32)]).join("")}`;
export { transactionKey } from "../../domain/payment.ts";
export const wrongCodeMessage = "Code not recognized. Codes work only on the number they were sent to.";
const options = { isolationLevel: "ReadCommitted", timeout: 15_000 } as const;
const validDays = (days: number, maximum = 366) => Number.isInteger(days) && days >= 1 && days <= maximum;
const validAmount = (amount: number) => Number.isInteger(amount) && amount >= 0 && amount <= 4_294_967_295;
const invalid = (message = "Check the values and try again."): CodeFailure => ({ status: "invalid", message });
const refused = (): CodeFailure => ({ status: "refused", message: "We couldn't complete this. Please contact us." });

export type ReadyCode = Readonly<{ id: string; accountId: string; phone: string; code: string; reference: string;
  planName: string; startsAt: Date; endsAt: Date; renewal: boolean; source: string }>;
export type CodeFailure = Readonly<{ status: "invalid" | "refused" | "duplicate" | "not-found"; message: string; submissionId?: string }>;
export type CodeOutcome = Readonly<{ status: "created"; ready: ReadyCode }> | Readonly<{ status: "saved" }> | CodeFailure;
export type RedeemOutcome = Readonly<{ status: "accepted"; token?: string }>
  | Readonly<{ status: "not-recognized" | "busy" | "refused" }> | Readonly<{ status: "ended"; endsAt: Date }>;
export type PaymentApproval = Readonly<{ network: "mtn" | "airtel"; transactionRef: string; amountReceivedUgx: number; planId: string }>;
type Snapshot = Readonly<{ planId?: string | null; planName: string; durationDays: number; priceUgx: number; extensionDays?: number }>;
type Creation = Snapshot & Readonly<{ source: string; paymentSubmissionId?: string; amountReceivedUgx?: number; note?: string;
  termsVersion?: string | null; copyPeriod?: Pick<AccessCode, "activatedAt" | "startsAt" | "endsAt"> }>;

export async function lockMemberAccount(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT id FROM MemberAccount WHERE id = ${id} FOR UPDATE`;
  return tx.memberAccount.findUnique({ where: { id } });
}

/** The account lock serializes confirmation and renewal. Unlock never calls this function. */
export async function activate(tx: Prisma.TransactionClient, accountId: string, code: Snapshot, now: Date, termsVersion: string | null) {
  const latest = await tx.accessCode.findFirst({ where: { accountId, revokedAt: null }, orderBy: { endsAt: "desc" }, select: { endsAt: true } });
  const startsAt = new Date(Math.max(now.getTime(), latest?.endsAt.getTime() ?? 0));
  return { activatedAt: now, startsAt, endsAt: new Date(startsAt.getTime() + (code.durationDays + (code.extensionDays ?? 0)) * subscriptionDayMs), termsVersion };
}

/** Retries only database-only, rolled-back work (a random reference collision or a concurrent row lock). */
async function codeTransaction<T>(database: DatabaseRuntime, run: (tx: Prisma.TransactionClient, rollback: (outcome: T) => never) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await decide(database, run); }
    catch (error) {
      if (attempt >= 3 || !(error instanceof DatabaseOperationError) || !["constraint", "conflict"].includes(error.code)) throw error;
    }
  }
}

export function createAccessCodes({ database, config, now = Date.now }: {
  database: DatabaseRuntime; config: Pick<AnalyticsConfig, "key">; now?: () => number;
}) {
  const limit = createMemberRateLimit(database, config, now);
  const audit = (tx: Prisma.TransactionClient, accountId: string, id: string, action: OwnerAuditAction, actor: string, at: Date,
    details: Record<string, unknown> = {}, targetType: "access-code" | "member" | "payment" | "member-session" = "access-code") =>
    writeOwnerAudit(tx, { at, actor, action, accountId, targetType, targetId: id, details });

  async function create(tx: Prisma.TransactionClient, account: { id: string; phone: string | null }, fields: Creation, actor: string, at: Date): Promise<ReadyCode> {
    if (!account.phone) throw new Error("An erased account cannot receive a code.");
    const plain = generateCode(), salt = newSalt(), reference = newReference();
    const period = fields.copyPeriod ? { activatedAt: fields.copyPeriod.activatedAt, startsAt: fields.copyPeriod.startsAt,
      endsAt: fields.copyPeriod.endsAt, termsVersion: fields.termsVersion ?? null }
      : await activate(tx, account.id, fields, at, fields.termsVersion ?? null);
    const { copyPeriod: _copyPeriod, ...data } = fields;
    void _copyPeriod;
    const code = await tx.accessCode.create({ data: { ...data, ...period, id: randomUUID(), accountId: account.id,
      codeSalt: salt, codeHash: hashCode(salt, plain), reference: reference.slice(2), createdAt: at, createdBy: actor } });
    const renewal = await tx.memberSession.count({ where: { accountId: account.id, codeEnteredAt: { not: null }, expiresAt: { gt: at } } }) > 0;
    await audit(tx, account.id, code.id, "code_created", actor, at, { source: fields.source, reference, durationDays: code.durationDays,
      extensionDays: code.extensionDays, startsAt: code.startsAt, endsAt: code.endsAt });
    return { id: code.id, accountId: account.id, phone: account.phone, code: formatCode(plain), reference, planName: code.planName,
      startsAt: code.startsAt, endsAt: code.endsAt, renewal, source: fields.source };
  }

  async function rechain(tx: Prisma.TransactionClient, accountId: string, at: Date) {
    const codes = await tx.accessCode.findMany({ where: { accountId, revokedAt: null, endsAt: { gt: at } } });
    for (const code of chainPeriods(codes, at)) {
      const old = codes.find((row) => row.id === code.id)!;
      if (+old.startsAt !== +code.startsAt || +old.endsAt !== +code.endsAt) {
        await tx.accessCode.update({ where: { id: code.id }, data: { startsAt: code.startsAt, endsAt: code.endsAt } });
      }
    }
  }

  async function revoke(tx: Prisma.TransactionClient, code: AccessCode, reason: string, actor: string, at: Date, replacement?: string,
    details: Record<string, unknown> = {}) {
    await tx.accessCode.update({ where: { id: code.id }, data: { revokedAt: at, revokedReason: reason, ...(replacement ? { replacedById: replacement } : {}) } });
    await tx.memberSession.updateMany({ where: { accountId: code.accountId, accessCodeId: code.id }, data: { codeEnteredAt: null, accessCodeId: null } });
    await audit(tx, code.accountId, code.id, "code_revoked", actor, at, { reason, ...details });
  }

  async function wrong(tx: Prisma.TransactionClient, address: string, at: Date): Promise<RedeemOutcome> {
    return { status: await takeMemberLimit(tx, config, { purpose: "wrong-codes", value: address, maximum: 100, windowMs: memberRateRules.hourMs }, at)
      ? "not-recognized" : "busy" };
  }

  async function match(tx: Prisma.TransactionClient, accountId: string, input: unknown) {
    const normalized = extractCode(input);
    if (!normalized) return null;
    const codes = await tx.accessCode.findMany({ where: { accountId } });
    let found: AccessCode | null = null;
    for (const code of codes) if (timingSafeEqual(Buffer.from(hashCode(code.codeSalt, normalized), "hex"), Buffer.from(code.codeHash, "hex"))) found = code;
    return found;
  }

  async function unlock(tx: Prisma.TransactionClient, session: MemberSession, code: AccessCode, at: Date, maximum: number, termsVersion: string, freshToken?: string): Promise<RedeemOutcome> {
    if (!code.termsVersion) await tx.accessCode.update({ where: { id: code.id }, data: { termsVersion } });
    let token: string | undefined, hash = session.tokenHash;
    if (!session.codeEnteredAt) {
      token = freshToken ?? randomBytes(32).toString("base64url"); hash = memberTokenHash(token);
      const unlocked = { codeEnteredAt: at, accessCodeId: code.id };
      if (freshToken) await tx.memberSession.update({ where: { tokenHash: hash }, data: unlocked });
      else {
        await tx.memberSession.create({ data: { ...session, ...unlocked, tokenHash: hash, createdAt: at, lastSeenAt: at,
          expiresAt: new Date(at.getTime() + memberSessionRules.expiryMs) } });
        await tx.memberSession.delete({ where: { tokenHash: session.tokenHash } });
      }
      await audit(tx, code.accountId, hash, "device_unlocked", "member", at, { codeId: code.id }, "member-session");
    }
    const devices = await tx.memberSession.findMany({ where: { accountId: code.accountId, codeEnteredAt: { not: null }, expiresAt: { gt: at } },
      orderBy: [{ codeEnteredAt: "asc" }, { tokenHash: "asc" }] });
    for (const device of devices.filter((row) => row.tokenHash !== hash).slice(0, Math.max(0, devices.length - maximum))) {
      await tx.memberSession.update({ where: { tokenHash: device.tokenHash }, data: { codeEnteredAt: null, accessCodeId: null } });
      await audit(tx, code.accountId, device.tokenHash, "device_evicted", "member", at, {}, "member-session");
    }
    return token ? { status: "accepted", token } : { status: "accepted" };
  }

  async function accountForPhone(tx: Prisma.TransactionClient, phone: string, at: Date) {
    await tx.$executeRaw`INSERT INTO MemberAccount (id, phone, createdAt, lastSignInAt) VALUES (${randomUUID()}, ${phone}, ${at}, ${at})
      ON DUPLICATE KEY UPDATE id = id`;
    return tx.memberAccount.findUniqueOrThrow({ where: { phone } });
  }

  async function approval(tx: Prisma.TransactionClient, account: { id: string; phone: string | null }, fields: PaymentApproval,
    actor: string, at: Date, submissionId?: string, note?: string): Promise<CodeOutcome> {
    const key = transactionKey(fields.transactionRef);
    if (!key || fields.transactionRef.length > 40 || !["mtn", "airtel"].includes(fields.network) || !validAmount(fields.amountReceivedUgx)) return invalid();
    // The existing singleton lock serializes owner confirmations across accounts and networks, independently of key rotation.
    await lockSettings(tx, actor, at);
    const duplicate = await tx.paymentSubmission.findFirst({ where: { approvedTxnKey: { in: [`mtn:${key}`, `airtel:${key}`] } }, select: { id: true } });
    if (duplicate) return { status: "duplicate", message: "This transaction ID was already approved.", submissionId: duplicate.id };
    const plan = await tx.subscriptionPlan.findUnique({ where: { id: fields.planId } });
    if (!plan) return invalid("Choose a plan.");
    const existing = submissionId ? await tx.paymentSubmission.findUnique({ where: { id: submissionId } }) : null;
    if (submissionId && (!existing || existing.accountId !== account.id || !["pending", "superseded"].includes(existing.status))) return refused();
    const final = { planId: plan.id, planName: plan.name, durationDays: plan.durationDays, priceUgx: plan.priceUgx,
      status: "approved", network: fields.network, transactionRef: fields.transactionRef.toUpperCase().replace(/\s/gu, ""),
      amountReceivedUgx: fields.amountReceivedUgx, approvedTxnKey: `${fields.network}:${key}`, decidedAt: at, decidedBy: actor };
    const submission = existing ? await tx.paymentSubmission.update({ where: { id: existing.id }, data: final })
      : await tx.paymentSubmission.create({ data: { ...final, id: randomUUID(), accountId: account.id, reference: newReference().slice(2), source: "owner",
        submittedAt: at, claimedNetwork: fields.network, claimedTxnRef: final.transactionRef, claimedTxnKey: key, claimedAmountUgx: fields.amountReceivedUgx } });
    const ready = await create(tx, account, { source: "payment", paymentSubmissionId: submission.id, planId: plan.id, planName: plan.name,
      durationDays: plan.durationDays, priceUgx: plan.priceUgx, termsVersion: existing?.termsVersion ?? null, ...(note ? { note } : {}) }, actor, at);
    await audit(tx, account.id, submission.id, "payment_approved", actor, at, { codeId: ready.id, amountReceivedUgx: fields.amountReceivedUgx }, "payment");
    return { status: "created", ready };
  }

  return Object.freeze({
    async redeem(member: MemberIdentity, input: unknown, address: string, maximum: number, termsVersion: string): Promise<RedeemOutcome> {
      const at = new Date(now());
      return codeTransaction(database, async (tx) => {
        const account = await lockMemberAccount(tx, member.accountId);
        const session = await tx.memberSession.findUnique({ where: { tokenHash: member.tokenHash } });
        if (!account || account.blockedAt || account.erasedAt || !session || session.expiresAt <= at) return { status: "refused" };
        const code = await match(tx, account.id, input);
        if (!code) return wrong(tx, address, at);
        if (["expired", "revoked"].includes(codeStatus(code, at))) return { status: "ended", endsAt: code.endsAt };
        return unlock(tx, session, code, at, maximum, termsVersion);
      });
    },

    async signInWithCode(phone: string, input: unknown, address: string, maximum: number, termsVersion: string, previous?: string): Promise<RedeemOutcome> {
      if (!await limit({ purpose: "sign-ins", value: address, maximum: memberRateRules.signIns, windowMs: memberRateRules.hourMs })) return { status: "busy" };
      const at = new Date(now());
      return codeTransaction(database, async (tx) => {
        const lookup = await tx.memberAccount.findUnique({ where: { phone }, select: { id: true } });
        if (!lookup) return wrong(tx, address, at);
        const account = await lockMemberAccount(tx, lookup.id);
        if (!account || account.blockedAt || account.erasedAt) return { status: "refused" };
        const code = await match(tx, account.id, input);
        if (!code) return wrong(tx, address, at);
        if (["expired", "revoked"].includes(codeStatus(code, at))) return { status: "ended", endsAt: code.endsAt };
        const { session, token } = await issueMemberSession(tx, account.id, at, previous);
        await tx.memberAccount.update({ where: { id: account.id }, data: { lastSignInAt: at } });
        return unlock(tx, session, code, at, maximum, termsVersion, token);
      });
    },

    async manual(input: { phone: string; planId?: string; durationDays?: number; amountReceivedUgx: number; note: string;
      network?: "mtn" | "airtel"; transactionRef?: string }, actor: string): Promise<CodeOutcome> {
      const phone = normalizePhone(input.phone), note = input.note.trim();
      if (!phone || !note || note.length > 200 || !validAmount(input.amountReceivedUgx)
        || (!!input.network !== !!input.transactionRef) || input.transactionRef && !input.planId) return invalid();
      return codeTransaction(database, async (tx, rollback) => {
        const at = new Date(now()), account = await accountForPhone(tx, phone, at);
        if (account.blockedAt || account.erasedAt) return rollback(refused());
        if (input.network && input.transactionRef && input.planId) {
          const outcome = await approval(tx, account, { network: input.network, transactionRef: input.transactionRef,
            planId: input.planId, amountReceivedUgx: input.amountReceivedUgx }, actor, at, undefined, note);
          return outcome.status === "created" ? outcome : rollback(outcome);
        }
        const plan = input.planId ? await tx.subscriptionPlan.findUnique({ where: { id: input.planId } }) : null;
        const days = plan?.durationDays ?? input.durationDays ?? 0;
        if (!validDays(days) || input.planId && !plan) return rollback(invalid());
        return { status: "created", ready: await create(tx, account, { source: "manual", planId: plan?.id ?? null,
          planName: plan?.name ?? "Manual", durationDays: days, priceUgx: plan?.priceUgx ?? 0, amountReceivedUgx: input.amountReceivedUgx, note }, actor, at) };
      });
    },

    async approvePayment(id: string, fields: PaymentApproval, actor: string): Promise<CodeOutcome> {
      return codeTransaction(database, async (tx, rollback) => {
        const submission = await tx.paymentSubmission.findUnique({ where: { id } });
        if (!submission) return rollback(refused());
        const account = await lockMemberAccount(tx, submission.accountId);
        if (!account || account.blockedAt || account.erasedAt) return rollback(refused());
        const outcome = await approval(tx, account, fields, actor, new Date(now()), id);
        return outcome.status === "created" ? outcome : rollback(outcome);
      });
    },

    async revoke(id: string, reason: string, actor: string): Promise<CodeOutcome> {
      if (!reason.trim() || reason.length > 32 || auditTextErrors({ reason })) return invalid();
      return codeTransaction(database, async (tx, rollback) => {
        const initial = await tx.accessCode.findUnique({ where: { id } });
        if (!initial) return rollback(refused());
        await lockMemberAccount(tx, initial.accountId);
        const code = await tx.accessCode.findUniqueOrThrow({ where: { id } });
        if (code.revokedAt) return rollback(refused());
        const at = new Date(now());
        await revoke(tx, code, reason.trim(), actor, at); await rechain(tx, code.accountId, at);
        return { status: "saved" };
      });
    },

    async extend(id: string, days: number, actor: string): Promise<CodeOutcome> {
      if (!validDays(days, 60)) return invalid();
      return codeTransaction(database, async (tx, rollback) => {
        const initial = await tx.accessCode.findUnique({ where: { id } });
        if (!initial) return rollback(refused());
        await lockMemberAccount(tx, initial.accountId);
        const code = await tx.accessCode.findUniqueOrThrow({ where: { id } });
        if (code.revokedAt || code.extensionDays + days > 65_535) return rollback(refused());
        const at = new Date(now());
        const periods = await tx.accessCode.findMany({ where: { accountId: code.accountId, revokedAt: null } });
        for (const period of extendPeriods(periods, id, days)) {
          if (period.id !== id && period.startsAt < code.endsAt) continue;
          await tx.accessCode.update({ where: { id: period.id }, data: { extensionDays: period.extensionDays, startsAt: period.startsAt, endsAt: period.endsAt } });
        }
        await audit(tx, code.accountId, id, "code_extended", actor, at, { days });
        return { status: "saved" };
      });
    },

    async reissue(id: string, actor: string): Promise<CodeOutcome> {
      return codeTransaction(database, async (tx, rollback) => {
        const initial = await tx.accessCode.findUnique({ where: { id } });
        if (!initial) return rollback(refused());
        const account = await lockMemberAccount(tx, initial.accountId);
        const code = await tx.accessCode.findUniqueOrThrow({ where: { id } });
        if (!account || account.blockedAt || account.erasedAt || code.revokedAt) return rollback(refused());
        const at = new Date(now());
        const ready = await create(tx, account, { source: "reissue", planId: code.planId, planName: code.planName, durationDays: code.durationDays,
          priceUgx: 0, extensionDays: code.extensionDays, termsVersion: code.termsVersion, copyPeriod: code }, actor, at);
        await tx.accessCode.update({ where: { id }, data: { revokedAt: at, revokedReason: "reissue", replacedById: ready.id } });
        await tx.memberSession.updateMany({ where: { accountId: code.accountId, accessCodeId: id }, data: { accessCodeId: ready.id } });
        await audit(tx, account.id, id, "code_reissued", actor, at, { replacementId: ready.id });
        return { status: "created", ready };
      });
    },

    async changeNumber(accountId: string, input: { newPhone: string; verifiedBy: "old-number" | "payment-details" }, actor: string): Promise<CodeOutcome> {
      const phone = normalizePhone(input.newPhone);
      if (!phone || !["old-number", "payment-details"].includes(input.verifiedBy)) return invalid();
      return codeTransaction(database, async (tx, rollback) => {
        const at = new Date(now());
        let destination = await tx.memberAccount.findUnique({ where: { phone } });
        if (!destination) destination = await tx.memberAccount.create({ data: { id: randomUUID(), phone, createdAt: at, lastSignInAt: at } });
        if (destination.id === accountId) return rollback(invalid());
        for (const id of [accountId, destination.id].sort()) await lockMemberAccount(tx, id);
        const old = await tx.memberAccount.findUnique({ where: { id: accountId } });
        destination = await tx.memberAccount.findUniqueOrThrow({ where: { id: destination.id } });
        if (!old || old.blockedAt || old.erasedAt || destination.blockedAt || destination.erasedAt) return rollback(refused());
        const codes = await tx.accessCode.findMany({ where: { accountId, revokedAt: null, endsAt: { gt: at } } });
        const days = remainingDays(codes, at);
        if (!validDays(days)) return rollback(invalid("Remaining access must be between 1 and 366 days."));
        const ready = await create(tx, destination, { source: "number-change", planName: "Transferred access", durationDays: days, priceUgx: 0 }, actor, at);
        for (const code of codes) await revoke(tx, code, "number-change", actor, at, ready.id, { verifiedBy: input.verifiedBy });
        await audit(tx, destination.id, ready.id, "number_changed", actor, at, { previousAccountId: accountId, verifiedBy: input.verifiedBy, days });
        return { status: "created", ready };
      });
    },

    async reversePayment(id: string, reason: "network-reversal" | "wrong-account", actor: string): Promise<CodeOutcome & { carriedOtherDays?: boolean }> {
      if (!["network-reversal", "wrong-account"].includes(reason)) return invalid();
      // Discover account locks first, then re-read the chain while holding all of them. A concurrent transfer retries discovery.
      for (let attempt = 0; attempt < 4; attempt++) {
        const chain = await database.query(async (tx) => {
          const rows: AccessCode[] = [];
          let code = await tx.accessCode.findUnique({ where: { paymentSubmissionId: id } });
          while (code && !rows.some((row) => row.id === code!.id)) { rows.push(code); code = code.replacedById ? await tx.accessCode.findUnique({ where: { id: code.replacedById } }) : null; }
          return rows;
        });
        const locked = [...new Set(chain.map((row) => row.accountId))].sort();
        const outcome = await codeTransaction<CodeOutcome | { status: "retry"; }>(database, async (tx, rollback) => {
          for (const accountId of locked) await lockMemberAccount(tx, accountId);
          const submission = await tx.paymentSubmission.findUnique({ where: { id } });
          if (!submission || submission.status !== "approved" || !chain.length) return rollback(refused());
          let live = await tx.accessCode.findUniqueOrThrow({ where: { paymentSubmissionId: id } });
          const visited = new Set<string>();
          while (live.replacedById) {
            if (visited.has(live.id)) return rollback(refused());
            visited.add(live.id); live = await tx.accessCode.findUniqueOrThrow({ where: { id: live.replacedById } });
            if (!locked.includes(live.accountId)) return rollback({ status: "retry" });
          }
          const at = new Date(now());
          await tx.paymentSubmission.update({ where: { id }, data: { status: "reversed", reversedAt: at, reverseReason: reason } });
          if (!live.revokedAt) { await revoke(tx, live, reason, actor, at); await rechain(tx, live.accountId, at); }
          await audit(tx, submission.accountId, id, "payment_reversed", actor, at, { reason, liveCodeId: live.id }, "payment");
          return { status: "saved", carriedOtherDays: live.source === "number-change" };
        });
        if (outcome.status !== "retry") return outcome;
      }
      return refused();
    },

    async sendTrial(accountId: string, trialDays: number, actor: string): Promise<CodeOutcome> {
      if (!validDays(trialDays, 7)) return invalid();
      return codeTransaction(database, async (tx, rollback) => {
        const account = await lockMemberAccount(tx, accountId);
        if (!account || account.blockedAt || account.erasedAt || !account.trialRequestedAt || account.trialDismissedAt
          || await tx.accessCode.count({ where: { accountId } })) return rollback(refused());
        const at = new Date(now()), ready = await create(tx, account, { source: "trial", planName: "Free trial", durationDays: trialDays,
          priceUgx: 0, amountReceivedUgx: 0 }, actor, at);
        await audit(tx, accountId, ready.id, "trial_sent", actor, at, { days: trialDays });
        return { status: "created", ready };
      });
    },

    async dismissTrial(accountId: string, actor: string): Promise<CodeOutcome> {
      return codeTransaction(database, async (tx, rollback) => {
        const account = await lockMemberAccount(tx, accountId);
        if (!account?.trialRequestedAt || account.trialDismissedAt || await tx.accessCode.count({ where: { accountId } })) return rollback(refused());
        const at = new Date(now());
        await tx.memberAccount.update({ where: { id: accountId }, data: { trialDismissedAt: at } });
        await audit(tx, accountId, accountId, "trial_dismissed", actor, at, {}, "member");
        return { status: "saved" };
      });
    },

    async accountView(member: MemberIdentity) {
      if (!member.codeEnteredAt || member.blocked) return null;
      return database.transaction(async (tx) => {
        const session = await tx.memberSession.findUnique({ where: { tokenHash: member.tokenHash }, include: { account: true } });
        const at = new Date(now());
        if (!session?.codeEnteredAt || session.expiresAt <= at || session.account.blockedAt || session.account.erasedAt) return null;
        const codes = await tx.accessCode.findMany({ where: { accountId: member.accountId, revokedAt: null }, orderBy: { startsAt: "asc" },
          select: { id: true, startsAt: true, endsAt: true, durationDays: true, extensionDays: true, revokedAt: true, planName: true } });
        const devices = await tx.memberSession.findMany({ where: { accountId: member.accountId, codeEnteredAt: { not: null }, expiresAt: { gt: at } },
          orderBy: { lastSeenAt: "desc" }, select: { tokenHash: true, lastSeenAt: true } });
        return { codes, devices };
      }, options);
    },
  });
}
export type AccessCodes = ReturnType<typeof createAccessCodes>;
