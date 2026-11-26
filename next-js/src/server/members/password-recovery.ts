import "server-only";

import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import { normalizePhone } from "../../domain/phone.ts";
import { authCopy } from "../../i18n/messages/auth.ts";
import { writeOwnerAudit, type OwnerAuditAction } from "../admin/audit.ts";
import type { AnalyticsConfig } from "../analytics/analytics-config.ts";
import { hashPassword } from "../analytics/analytics-password.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import type { MemberAccount, MemberPasswordResetRequest, Prisma } from "../generated/prisma/client.ts";
import { lockMemberAccount } from "./access-codes.ts";
import { isMemberAdminPhone } from "./member-admin.ts";
import { canChangeMemberPassword, memberPasswordCooldownMessage, memberPasswordMaximum, validReplacementPassword } from "./password-reset-state.ts";
import { createMemberRateLimit } from "./rate-limit.ts";
import { decide } from "./settings.ts";

export { invalidatePasswordResetRequests } from "./password-reset-state.ts";

export const passwordRecoveryRules = Object.freeze({ resetSessionMs: 15 * 60_000, linkLifetimeMs: 86_400_000 });
export const recoveryOwnershipMethods = ["call", "sms", "whatsapp"] as const;
export const recoverySendChannels = ["sms", "whatsapp", "other"] as const;
type OwnershipMethod = typeof recoveryOwnershipMethods[number];
type SendChannel = typeof recoverySendChannels[number];
type RecoveryStatus = "pending" | "link-generated" | "expired" | "completed" | "cancelled";
type RequestSummary = Pick<MemberPasswordResetRequest, "id" | "phone" | "requestedAt" | "status" | "expiresAt">;

export type PasswordResetRequestSummary = Readonly<{ id: string; phone: string; requestedAt: string; status: RecoveryStatus }>;
export type PasswordResetRequestDetail = PasswordResetRequestSummary & Readonly<{
  accountId: string; accountCreatedAt: string; phoneVerifiedAt: string | null;
  ownershipVerifiedAt: string | null; ownershipVerifiedBy: string | null; ownershipMethod: string | null;
  generatedAt: string | null; expiresAt: string | null; generation: number; token: string | null;
  markedSentAt: string | null; markedSentBy: string | null; markedSentChannel: string | null; completedAt: string | null;
}>;
export type PasswordResetAdminOutcome = Readonly<{ status: "ok"; request: PasswordResetRequestDetail }>
  | Readonly<{ status: "missing" | "invalid" | "conflict"; message: string }>;

const requested = { status: "requested", message: "Your password reset request has been sent to our support team" } as const;
const existing = { status: "existing", message: "You already have a password reset request. If support is delayed, contact the admin." } as const;
const complete = { status: "completed", message: "Password changed successfully" } as const;
const busy = { status: "busy", message: "Too many attempts. Please wait before trying again." } as const;
const unusable = { status: "unusable", message: "This reset link has expired, was replaced, or has already been used. Request a new password reset if you still need help." } as const;
const missing = { status: "missing", message: "This password request is unavailable." } as const;
const invalid = (message: string) => ({ status: "invalid", message } as const);
const conflict = (message: string) => ({ status: "conflict", message } as const);
const safeAddress = (address: string) => address === "unknown" ? "unresolved-address" : address;
const requestOrder = [{ requestedAt: "desc" }, { id: "desc" }] satisfies Prisma.MemberPasswordResetRequestOrderByWithRelationInput[];
const summaryFields = { id: true, phone: true, requestedAt: true, status: true, expiresAt: true } as const;
const accountFields = { id: true, phone: true, passwordHash: true, phoneVerifiedAt: true, passwordChangedAt: true, createdAt: true,
  blockedAt: true, erasedAt: true } as const;
const isRequestId = (value: string) => /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/u.test(value);
const isToken = (value: unknown): value is string => typeof value === "string" && /^[\w-]{43}$/u.test(value);
const instant = (date: Date | null) => date?.toISOString() ?? null;

function auditChange(tx: Prisma.TransactionClient, request: MemberPasswordResetRequest, actor: string, at: Date,
  action: OwnerAuditAction, details: Record<string, string | number>) {
  return writeOwnerAudit(tx, { at, actor: `member-admin:${actor}`, action, accountId: request.accountId, targetType: "password-request", targetId: request.id, details });
}

function requestStatus(request: RequestSummary, at: Date): RecoveryStatus {
  if (request.status === "link-generated") return request.expiresAt && request.expiresAt > at ? "link-generated" : "expired";
  if (request.status === "pending" || request.status === "completed") return request.status;
  return "cancelled";
}

function summary(request: RequestSummary, at: Date): PasswordResetRequestSummary {
  return { id: request.id, phone: request.phone, requestedAt: request.requestedAt.toISOString(), status: requestStatus(request, at) };
}

type RecoveryAccount = Pick<MemberAccount, keyof typeof accountFields>;

export function createPasswordRecovery({ database, config, now = Date.now, adminPhone = isMemberAdminPhone }: {
  database: DatabaseRuntime; config: Pick<AnalyticsConfig, "key">; now?: () => number; adminPhone?: (phone: string) => boolean;
}) {
  const limit = createMemberRateLimit(database, config, now);
  const digest = (token: string) => config.key("member-password-reset-link-lookup-v1", token);
  const encryptionKey = () => Buffer.from(config.key("member-password-reset-link-encryption-v1", "aes-256-gcm"), "hex");
  const binding = (request: Pick<MemberPasswordResetRequest, "id" | "accountId" | "generation">) =>
    Buffer.from(`${request.id}:${request.accountId}:${request.generation}`);
  const eligible = (account: RecoveryAccount | null, phone: string): account is RecoveryAccount =>
    !!account && account.phone === phone && !!account.passwordHash && !account.blockedAt && !account.erasedAt && !adminPhone(phone);

  function encrypt(token: Buffer, request: Pick<MemberPasswordResetRequest, "id" | "accountId" | "generation">) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
    cipher.setAAD(binding(request));
    const ciphertext = Buffer.concat([cipher.update(token), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url");
  }

  function currentToken(request: MemberPasswordResetRequest) {
    if (!request.tokenCiphertext) return null;
    const envelope = Buffer.from(request.tokenCiphertext, "base64url");
    if (envelope.length !== 60) return null;
    try {
      const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), envelope.subarray(0, 12));
      decipher.setAAD(binding(request));
      decipher.setAuthTag(envelope.subarray(12, 28));
      return Buffer.concat([decipher.update(envelope.subarray(28)), decipher.final()]).toString("base64url");
    } catch { return null; }
  }

  function detail(request: MemberPasswordResetRequest, account: RecoveryAccount, at: Date): PasswordResetRequestDetail {
    const row = summary(request, at);
    return { ...row, accountId: account.id, accountCreatedAt: account.createdAt.toISOString(), phoneVerifiedAt: instant(account.phoneVerifiedAt),
      ownershipVerifiedAt: instant(request.ownershipVerifiedAt), ownershipVerifiedBy: request.ownershipVerifiedBy, ownershipMethod: request.ownershipMethod,
      generatedAt: instant(request.generatedAt), expiresAt: instant(request.expiresAt), generation: request.generation,
      token: row.status === "link-generated" && eligible(account, request.phone) ? currentToken(request) : null,
      markedSentAt: instant(request.markedSentAt), markedSentBy: request.markedSentBy, markedSentChannel: request.markedSentChannel,
      completedAt: instant(request.completedAt) };
  }

  function usable(request: MemberPasswordResetRequest, account: RecoveryAccount | null, at: Date): account is RecoveryAccount {
    return !!request.tokenHash && requestStatus(request, at) === "link-generated" && !!request.ownershipVerifiedAt && eligible(account, request.phone);
  }

  type AdminChange = (tx: Prisma.TransactionClient, request: MemberPasswordResetRequest, account: RecoveryAccount, at: Date) =>
    Promise<PasswordResetAdminOutcome>;
  async function changeRequest(id: string, change: AdminChange): Promise<PasswordResetAdminOutcome> {
    if (!isRequestId(id)) return missing;
    return decide<PasswordResetAdminOutcome>(database, async (tx) => {
      const target = await tx.memberPasswordResetRequest.findUnique({ where: { id }, select: { accountId: true } });
      if (!target) return missing;
      const account = await lockMemberAccount(tx, target.accountId);
      const request = await tx.memberPasswordResetRequest.findUnique({ where: { id } });
      if (!request || !eligible(account, request.phone)) return missing;
      return change(tx, request, account, new Date(now()));
    });
  }

  return Object.freeze({
    /** Unknown and ineligible numbers receive matching first/repeat acknowledgements without populating the admin queue. */
    async request(phoneInput: unknown, address: string) {
      const phone = normalizePhone(phoneInput);
      if (!phone) return invalid("Enter a valid phone number with its country code.");
      if (!await limit({ purpose: "manual-reset-request-address", value: safeAddress(address), maximum: 30, windowMs: 3_600_000 })
        || !await limit({ purpose: "manual-reset-request-phone", value: phone, maximum: 10, windowMs: 3_600_000 })) return busy;
      const outcome = await decide(database, async (tx) => {
        const found = await tx.memberAccount.findUnique({ where: { phone }, select: { id: true } });
        const account = found ? await lockMemberAccount(tx, found.id) : null;
        if (!eligible(account, phone)) return null;
        const at = new Date(now());
        const live = await tx.memberPasswordResetRequest.findFirst({ where: { accountId: account.id, phone,
          OR: [{ status: "pending" }, { status: "link-generated", expiresAt: { gt: at } }],
        }, select: { id: true } });
        if (live) return existing;
        await tx.memberPasswordResetRequest.updateMany({
          where: { accountId: account.id, status: "link-generated", expiresAt: { lte: at }, tokenCiphertext: { not: null } },
          data: { tokenHash: null, tokenCiphertext: null },
        });
        await tx.memberPasswordResetRequest.create({ data: { id: randomUUID(), accountId: account.id, phone, requestedAt: at, status: "pending" } });
        return requested;
      });
      if (outcome) return outcome;
      return await limit({ purpose: "manual-reset-request-acknowledgement", value: phone, maximum: 1, windowMs: passwordRecoveryRules.linkLifetimeMs })
        ? requested : existing;
    },

    /** A page open does not advance a request or return account data. */
    async validate(token: unknown, address: string) {
      if (!isToken(token)) return unusable;
      if (!await limit({ purpose: "manual-reset-check-address", value: safeAddress(address), maximum: 60, windowMs: 15 * 60_000 })) return busy;
      const row = await database.query((tx) => tx.memberPasswordResetRequest.findUnique({
        where: { tokenHash: digest(token) }, include: { account: { select: accountFields } },
      }));
      return row && usable(row, row.account, new Date(now())) ? { status: "valid" } as const : unusable;
    },

    async redeem(token: unknown, password: unknown, confirm: unknown, address: string) {
      if (!isToken(token)) return unusable;
      if (!validReplacementPassword(password)) return invalid(`Enter a new password of up to ${memberPasswordMaximum} characters.`);
      if (password !== confirm) return invalid(authCopy.passwordMismatch);
      if (!await limit({ purpose: "manual-reset-redeem-address", value: safeAddress(address), maximum: 10, windowMs: 15 * 60_000 })) return busy;
      const tokenHash = digest(token);
      const initial = await database.query((tx) => tx.memberPasswordResetRequest.findUnique({
        where: { tokenHash }, include: { account: { select: accountFields } },
      }));
      if (!initial || !usable(initial, initial.account, new Date(now()))) return unusable;
      if (!await limit({ purpose: "manual-reset-redeem-account", value: initial.accountId, maximum: 10, windowMs: 15 * 60_000 })) return busy;
      const passwordHash = await hashPassword(password);
      return decide(database, async (tx) => {
        const account = await lockMemberAccount(tx, initial.accountId);
        const request = await tx.memberPasswordResetRequest.findUnique({ where: { id: initial.id } });
        const at = new Date(now());
        if (!request || request.tokenHash !== tokenHash || !usable(request, account, at)) return unusable;
        if (!canChangeMemberPassword(account, at)) return { status: "busy", message: memberPasswordCooldownMessage } as const;
        await tx.memberAccount.update({ where: { id: account.id }, data: { passwordHash, passwordChangedAt: at, phoneVerifiedAt: account.phoneVerifiedAt ?? at } });
        await tx.memberSession.deleteMany({ where: { accountId: account.id } });
        await tx.memberVerification.updateMany({ where: { accountId: account.id, consumedAt: null }, data: { consumedAt: at } });
        await tx.memberPasswordResetRequest.update({ where: { id: request.id }, data: {
          status: "completed", completedAt: at, tokenCiphertext: null, tokenHash: null,
        } });
        return complete;
      });
    },

    pendingCount() {
      return database.query((tx) => tx.memberPasswordResetRequest.count({ where: { status: "pending" } }));
    },

    async listRequests() {
      const rows = await database.query((tx) => tx.memberPasswordResetRequest.findMany({ orderBy: requestOrder, select: summaryFields }));
      const at = new Date(now());
      return rows.map((row) => summary(row, at));
    },

    async requestDetail(id: string) {
      if (!isRequestId(id)) return null;
      const row = await database.query((tx) => tx.memberPasswordResetRequest.findUnique({
        where: { id }, include: { account: { select: accountFields } },
      }));
      return row ? detail(row, row.account, new Date(now())) : null;
    },

    verifyOwnership(id: string, actorId: string, method: OwnershipMethod) {
      if (!recoveryOwnershipMethods.includes(method)) return Promise.resolve(invalid("Choose how you verified control of the registered number."));
      return changeRequest(id, async (tx, request, account, at) => {
        if (requestStatus(request, at) !== "pending") return conflict("Ownership can only be verified while the request is pending.");
        if (request.ownershipVerifiedAt) return { status: "ok", request: detail(request, account, at) };
        const saved = await tx.memberPasswordResetRequest.update({ where: { id }, data: {
          ownershipVerifiedAt: at, ownershipVerifiedBy: actorId, ownershipMethod: method,
        } });
        await auditChange(tx, saved, actorId, at, "password_request_verified", { method });
        return { status: "ok", request: detail(saved, account, at) };
      });
    },

    generateLink(id: string, actorId: string, expectedGeneration: number) {
      if (!Number.isSafeInteger(expectedGeneration) || expectedGeneration < 0) return Promise.resolve(invalid("Check the current request before generating a link."));
      return changeRequest(id, async (tx, request, account, at) => {
        if (!request.ownershipVerifiedAt) return conflict("Verify ownership of the registered number before generating a link.");
        const status = requestStatus(request, at);
        if (status === "completed" || status === "cancelled") return conflict("This password request is closed.");
        if (request.generation !== expectedGeneration) return conflict("Open the current request before replacing its reset link.");
        if (status === "expired") {
          const latest = await tx.memberPasswordResetRequest.findFirst({ where: { accountId: request.accountId }, orderBy: requestOrder, select: { id: true } });
          if (latest?.id !== id) return conflict("Open the latest request for this number to generate a link.");
        }
        const generation = request.generation + 1;
        const secret = randomBytes(32);
        const saved = await tx.memberPasswordResetRequest.update({ where: { id }, data: {
          status: "link-generated", generatedAt: at, generatedBy: actorId, expiresAt: new Date(+at + passwordRecoveryRules.linkLifetimeMs), generation,
          tokenHash: digest(secret.toString("base64url")), tokenCiphertext: encrypt(secret, { ...request, generation }),
          markedSentAt: null, markedSentBy: null, markedSentChannel: null,
        } });
        await auditChange(tx, saved, actorId, at, "password_request_link_generated", { generation });
        return { status: "ok", request: detail(saved, account, at) };
      });
    },

    markSent(id: string, actorId: string, channel: SendChannel, generation: number) {
      if (!recoverySendChannels.includes(channel)) return Promise.resolve(invalid("Choose the channel you used to send the message."));
      return changeRequest(id, async (tx, request, account, at) => {
        if (!usable(request, account, at) || request.generation !== generation) return conflict("Open the current reset link before marking it as sent.");
        if (request.markedSentAt) return request.markedSentChannel === channel ? { status: "ok", request: detail(request, account, at) }
          : conflict("Sending this link was already recorded.");
        const saved = await tx.memberPasswordResetRequest.update({ where: { id }, data: {
          markedSentAt: at, markedSentBy: actorId, markedSentChannel: channel,
        } });
        await auditChange(tx, saved, actorId, at, "password_request_marked_sent", { channel, generation });
        return { status: "ok", request: detail(saved, account, at) };
      });
    },
  });
}

export type PasswordRecovery = ReturnType<typeof createPasswordRecovery>;
