import "server-only";

import { randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { normalizePhone } from "../../domain/phone.ts";
import type { AnalyticsConfig } from "../analytics/analytics-config.ts";
import { hashPassword, verifyPassword } from "../analytics/analytics-password.ts";
import { DatabaseOperationError, type DatabaseRuntime } from "../database/client.ts";
import type { MemberAccount, MemberVerification, Prisma } from "../generated/prisma/client.ts";
import { issueMemberSession, validMemberToken, type MemberIdentity } from "./member-sessions.ts";
import { isMemberAdminPhone } from "./member-admin.ts";
import { verificationChannel, verificationDeliveryFailure, type MemberVerificationSender, type VerificationChannel, type VerificationPurpose } from "./member-verification-delivery.ts";
import { createMemberRateLimit, takeMemberLimit } from "./rate-limit.ts";
import { decide } from "./settings.ts";

export const memberAuthRules = Object.freeze({ codeMs: 5 * 60_000, resendMs: 60_000, codeAttempts: 5,
  passwordMin: 8, passwordMax: 128 });
export type { VerificationPurpose } from "./member-verification-delivery.ts";
export type AuthBinding = Readonly<{ member: MemberIdentity | null; anonymousToken?: string }>;
export type AuthFailure = Readonly<{ status: "invalid" | "unauthorized" | "busy" | "conflict" | "unavailable"; message: string }>;
type AuthSuccess = Readonly<{ status: "authenticated"; token: string; phone: string }>;
type ChallengeSuccess = Readonly<{ status: "sent"; challengeId: string; channel: VerificationChannel; expiresAt: Date; resendAt: Date }>;
type ConfirmSuccess = Readonly<{ status: "verified"; verificationToken: string; expiresAt: Date }>;
const invalid = (message = "The verification code is invalid or expired. Request a new code."): AuthFailure => ({ status: "invalid", message });
const refused = (): AuthFailure => ({ status: "unauthorized", message: "We couldn't verify these details. Please try again." });
const busy = (): AuthFailure => ({ status: "busy", message: "Too many attempts. Please wait before trying again." });
const conflict = (): AuthFailure => ({ status: "conflict", message: "This phone number is already registered. Log in or reset its password." });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const equalHash = (left: string, right: string) => /^[a-f0-9]{64}$/u.test(left) && /^[a-f0-9]{64}$/u.test(right)
  && timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
export const validMemberPassword = (value: unknown): value is string => typeof value === "string"
  && value.length >= memberAuthRules.passwordMin && value.length <= memberAuthRules.passwordMax;
let dummyPasswordHash: Promise<string> | undefined;
const dummyHash = () => dummyPasswordHash ??= hashPassword(randomBytes(32).toString("base64url"));

/** All proofs, mutations and throttles are durable; application restarts cannot reset attempts or extend validity. */
export function createMemberAuth({ database, config, sendVerification, now = Date.now, adminPhone = isMemberAdminPhone }: {
  database: DatabaseRuntime; config: Pick<AnalyticsConfig, "key">; sendVerification: MemberVerificationSender; now?: () => number;
  adminPhone?: (phone: string) => boolean;
}) {
  const limit = createMemberRateLimit(database, config, now);
  const key = (purpose: string, value: string) => config.key(`member-auth-${purpose}`, value);
  const bindingHash = (binding: AuthBinding) => binding.member ? key("binding", `session:${binding.member.tokenHash}`)
    : validMemberToken(binding.anonymousToken) ? key("binding", `browser:${binding.anonymousToken}`) : null;
  const safeAddress = (address: string) => address === "unknown" ? "unresolved-address" : address;
  const codeHash = (id: string, code: string) => key("sms-code", `${id}:${code}`);
  const proofHash = (id: string, token: string) => key("proof", `${id}:${token}`);

  async function currentAccount(tx: Prisma.TransactionClient, binding: AuthBinding, at: Date): Promise<MemberAccount | null> {
    if (!binding.member) return null;
    await tx.$queryRaw`SELECT id FROM MemberAccount WHERE id = ${binding.member.accountId} FOR UPDATE`;
    const account = await tx.memberAccount.findUnique({ where: { id: binding.member.accountId } });
    const session = await tx.memberSession.findUnique({ where: { tokenHash: binding.member.tokenHash } });
    return account && !account.blockedAt && !account.erasedAt && account.phone && (account.passwordHash || adminPhone(account.phone)) && session?.authenticatedAt
      && session.expiresAt > at && session.accountId === account.id ? account : null;
  }

  async function lockChallenge(tx: Prisma.TransactionClient, id: string) {
    await tx.$queryRaw`SELECT id FROM MemberVerification WHERE id = ${id} FOR UPDATE`;
    return tx.memberVerification.findUnique({ where: { id } });
  }

  async function proof(tx: Prisma.TransactionClient, input: unknown, purpose: VerificationPurpose, binding: AuthBinding,
    phone: string, accountId: string | null, at: Date): Promise<MemberVerification | null> {
    if (typeof input !== "string" || input.length !== 80) return null;
    const [id, token] = input.split(".");
    if (!id || !uuid.test(id) || !validMemberToken(token)) return null;
    const row = await lockChallenge(tx, id), bound = bindingHash(binding);
    return row && bound && row.bindingHash === bound && row.purpose === purpose && row.phone === phone
      && row.accountId === accountId && row.sentAt && row.confirmedAt && !row.consumedAt && row.expiresAt > new Date(Math.max(+at, now()))
      && row.proofHash && equalHash(row.proofHash, proofHash(id, token)) ? row : null;
  }

  async function rotate(tx: Prisma.TransactionClient, account: MemberAccount, binding: AuthBinding, at: Date): Promise<AuthSuccess> {
    const old = binding.member ? await tx.memberSession.findUnique({ where: { tokenHash: binding.member.tokenHash } }) : null;
    await tx.memberSession.deleteMany({ where: { accountId: account.id } });
    await tx.memberVerification.updateMany({ where: { accountId: account.id, consumedAt: null }, data: { consumedAt: at } });
    const { token, session } = await issueMemberSession(tx, account.id, at, undefined, true);
    // A profile change keeps this device's paid access; password recovery deliberately starts a fresh locked device.
    if (old?.codeEnteredAt && old.accessCodeId) await tx.memberSession.update({ where: { tokenHash: session.tokenHash },
      data: { codeEnteredAt: old.codeEnteredAt, accessCodeId: old.accessCodeId } });
    return { status: "authenticated", token, phone: account.phone! };
  }

  return Object.freeze({
    async login(phoneInput: unknown, password: unknown, address: string, previous?: string): Promise<AuthSuccess | AuthFailure> {
      const phone = normalizePhone(phoneInput);
      if (!phone || typeof password !== "string" || password.length > memberAuthRules.passwordMax) return refused();
      if (adminPhone(phone)) return { status: "unauthorized", message: "Use verification-code login for this administrator number." };
      if (!await limit({ purpose: "password-login-address", value: safeAddress(address), maximum: 30, windowMs: 15 * 60_000 })
        || !await limit({ purpose: "password-login-phone", value: phone, maximum: 10, windowMs: 15 * 60_000 })) return busy();
      const account = await database.query((tx) => tx.memberAccount.findUnique({ where: { phone } }));
      const matches = await verifyPassword(password, account?.passwordHash ?? await dummyHash());
      if (!matches || !account?.passwordHash || account.erasedAt || account.blockedAt) return refused();
      const at = new Date(now());
      return decide<AuthSuccess | AuthFailure>(database, async (tx) => {
        await tx.$queryRaw`SELECT id FROM MemberAccount WHERE id = ${account.id} FOR UPDATE`;
        const current = await tx.memberAccount.findUnique({ where: { id: account.id } });
        if (!current || current.phone !== phone || current.passwordHash !== account.passwordHash || current.blockedAt || current.erasedAt) return refused();
        if (adminPhone(phone)) return { status: "unauthorized", message: "Use verification-code login for this administrator number." };
        const { token } = await issueMemberSession(tx, account.id, at, previous, true);
        await tx.memberAccount.update({ where: { id: account.id }, data: { lastSignInAt: at } });
        return { status: "authenticated", token, phone };
      });
    },

    async loginWithCode(phoneInput: unknown, verificationToken: unknown, binding: AuthBinding, address: string, previous?: string): Promise<AuthSuccess | AuthFailure> {
      const phone = normalizePhone(phoneInput), at = new Date(now());
      if (!phone || binding.member || !adminPhone(phone)) return refused();
      if (!await limit({ purpose: "password-login-address", value: safeAddress(address), maximum: 30, windowMs: 15 * 60_000 })
        || !await limit({ purpose: "password-login-phone", value: phone, maximum: 10, windowMs: 15 * 60_000 })) return busy();
      try {
        return await decide<AuthSuccess | AuthFailure>(database, async (tx) => {
          let account = await tx.memberAccount.findUnique({ where: { phone } });
          if (account) {
            await tx.$queryRaw`SELECT id FROM MemberAccount WHERE id = ${account.id} FOR UPDATE`;
            account = await tx.memberAccount.findUnique({ where: { phone } });
            if (!account || account.blockedAt || account.erasedAt) return refused();
          }
          const verified = await proof(tx, verificationToken, "login", binding, phone, account?.id ?? null, at);
          if (!verified || !adminPhone(phone)) return invalid();
          if (verified.expiresAt <= new Date(now())) return invalid();
          account = account ? await tx.memberAccount.update({ where: { id: account.id }, data: { lastSignInAt: at } })
            : await tx.memberAccount.create({ data: { id: randomUUID(), phone, createdAt: at, lastSignInAt: at } });
          await tx.memberVerification.update({ where: { id: verified.id }, data: { consumedAt: at, accountId: account.id } });
          const { token } = await issueMemberSession(tx, account.id, at, previous, true);
          return { status: "authenticated", token, phone };
        });
      } catch (error) { if (error instanceof DatabaseOperationError && error.code === "constraint") return conflict(); throw error; }
    },

    async requestCode(purpose: VerificationPurpose, phoneInput: unknown, binding: AuthBinding, address: string, channelInput?: unknown): Promise<ChallengeSuccess | AuthFailure> {
      const bound = bindingHash(binding), at = new Date(now());
      const channel = verificationChannel(channelInput);
      if (!channel) return invalid("Choose WhatsApp or SMS for verification.");
      if (!bound || !["register", "reset", "phone", "password", "login"].includes(purpose)) return invalid("Choose a valid verification action.");
      const secured = purpose === "phone" || purpose === "password";
      if (secured !== Boolean(binding.member)) return refused();
      const phone = secured ? binding.member!.phone : normalizePhone(phoneInput);
      if (!phone) return invalid("Enter a valid phone number with its country code.");
      if (purpose === "login" && !adminPhone(phone)) return refused();
      const code = randomInt(0, 1_000_000).toString().padStart(6, "0"), id = randomUUID();
      const pending = await decide<ChallengeSuccess | AuthFailure>(database, async (tx) => {
        // Legacy bucket keys are retained: limits and resend checks are shared across channels, browsers and purposes.
        for (const item of [
          { purpose: "sms-phone", value: phone, maximum: 5, windowMs: 3_600_000 },
          { purpose: "sms-address", value: safeAddress(address), maximum: 20, windowMs: 3_600_000 },
          { purpose: "sms-browser", value: bound, maximum: 10, windowMs: 3_600_000 },
        ]) if (!await takeMemberLimit(tx, config, item, at)) return busy();
        const recent = await tx.memberVerification.findFirst({ where: { phone, createdAt: { gt: new Date(+at - memberAuthRules.resendMs) } },
          orderBy: { createdAt: "desc" } });
        if (recent) return busy();
        const account = secured ? await currentAccount(tx, binding, at) : await tx.memberAccount.findUnique({ where: { phone } });
        if (secured && (!account || account.phone !== phone) || purpose === "reset" && (!account || account.blockedAt || account.erasedAt)) return refused();
        if (purpose === "login" && (!adminPhone(phone) || account?.blockedAt || account?.erasedAt)) return refused();
        if (purpose === "register" && account) return conflict();
        await tx.memberVerification.updateMany({ where: { bindingHash: bound, purpose, consumedAt: null }, data: { consumedAt: at } });
        const expiresAt = new Date(+at + memberAuthRules.codeMs);
        await tx.memberVerification.create({ data: { id, accountId: account?.id ?? null, phone, purpose,
          bindingHash: bound, codeHash: codeHash(id, code), createdAt: at, expiresAt } });
        return { status: "sent", challengeId: id, channel, expiresAt, resendAt: new Date(+at + memberAuthRules.resendMs) };
      });
      if (pending.status !== "sent") return pending;
      try {
        await sendVerification({ phone, code, purpose, channel });
        const marked = await database.query((tx) => tx.memberVerification.updateMany({ where: { id, consumedAt: null, expiresAt: { gt: new Date(now()) } }, data: { sentAt: new Date(now()) } }));
        if (marked.count !== 1) return invalid();
        return pending;
      } catch {
        await database.query((tx) => tx.memberVerification.updateMany({ where: { id, consumedAt: null }, data: { consumedAt: new Date(now()) } })).catch(() => {});
        return { status: "unavailable", message: verificationDeliveryFailure(channel) };
      }
    },

    async confirmCode(id: unknown, code: unknown, binding: AuthBinding, address: string): Promise<ConfirmSuccess | AuthFailure> {
      const bound = bindingHash(binding), at = new Date(now());
      if (!bound || typeof id !== "string" || !uuid.test(id) || typeof code !== "string" || !/^\d{6}$/u.test(code)) return invalid();
      if (!await limit({ purpose: "sms-confirm-address", value: safeAddress(address), maximum: 50, windowMs: 15 * 60_000 })) return busy();
      return decide<ConfirmSuccess | AuthFailure>(database, async (tx) => {
        const row = await lockChallenge(tx, id);
        if (!row || row.bindingHash !== bound || !row.sentAt || row.confirmedAt || row.consumedAt || row.expiresAt <= new Date(Math.max(+at, now())) || row.attempts >= memberAuthRules.codeAttempts) return invalid();
        const matches = equalHash(row.codeHash, codeHash(id, code)), attempts = row.attempts + 1;
        if (!matches) {
          await tx.memberVerification.update({ where: { id }, data: { attempts, ...(attempts >= memberAuthRules.codeAttempts ? { consumedAt: at } : {}) } });
          return invalid("Incorrect verification code. Check your message and try again.");
        }
        const token = randomBytes(32).toString("base64url");
        await tx.memberVerification.update({ where: { id }, data: { attempts, confirmedAt: at, proofHash: proofHash(id, token) } });
        return { status: "verified", verificationToken: `${id}.${token}`, expiresAt: row.expiresAt };
      });
    },

    async register(phoneInput: unknown, password: unknown, verificationToken: unknown, binding: AuthBinding): Promise<AuthSuccess | AuthFailure> {
      const phone = normalizePhone(phoneInput), at = new Date(now());
      if (!phone || binding.member || !validMemberPassword(password)) return invalid("Enter a valid phone and a password of 8–128 characters.");
      try {
        return await decide<AuthSuccess | AuthFailure>(database, async (tx) => {
          const verified = await proof(tx, verificationToken, "register", binding, phone, null, at);
          if (!verified) return invalid();
          if (await tx.memberAccount.findUnique({ where: { phone } })) return conflict();
          const passwordHash = await hashPassword(password);
          if (verified.expiresAt <= new Date(now())) return invalid();
          const account = await tx.memberAccount.create({ data: { id: randomUUID(), phone, passwordHash, createdAt: at, lastSignInAt: at } });
          await tx.memberVerification.update({ where: { id: verified.id }, data: { consumedAt: at, accountId: account.id } });
          return rotate(tx, account, binding, at);
        });
      } catch (error) { if (error instanceof DatabaseOperationError && error.code === "constraint") return conflict(); throw error; }
    },

    async changePhone(phoneInput: unknown, verificationToken: unknown, binding: AuthBinding): Promise<AuthSuccess | AuthFailure> {
      const phone = normalizePhone(phoneInput), at = new Date(now());
      if (!phone || !binding.member) return invalid("Enter a valid new phone number with its country code.");
      try {
        return await decide<AuthSuccess | AuthFailure>(database, async (tx) => {
          const account = await currentAccount(tx, binding, at);
          if (!account?.phone) return refused();
          const verified = await proof(tx, verificationToken, "phone", binding, account.phone, account.id, at);
          if (!verified) return invalid();
          // An old-phone proof cannot establish ownership of a different privileged identity.
          if (phone !== account.phone && adminPhone(phone)) return invalid("This administrator number requires its own verification code. Log out and use verification-code login.");
          const existing = await tx.memberAccount.findUnique({ where: { phone } });
          if (existing && existing.id !== account.id) return conflict();
          if (verified.expiresAt <= new Date(now())) return invalid();
          const updated = await tx.memberAccount.update({ where: { id: account.id }, data: { phone } });
          await tx.memberVerification.update({ where: { id: verified.id }, data: { consumedAt: at } });
          return rotate(tx, updated, binding, at);
        });
      } catch (error) { if (error instanceof DatabaseOperationError && error.code === "constraint") return conflict(); throw error; }
    },

    async changePassword(password: unknown, verificationToken: unknown, binding: AuthBinding, phoneInput?: unknown): Promise<AuthSuccess | AuthFailure> {
      const phone = binding.member?.phone ?? normalizePhone(phoneInput), at = new Date(now());
      if (!phone || !validMemberPassword(password)) return invalid("Use a password of 8–128 characters.");
      return decide<AuthSuccess | AuthFailure>(database, async (tx) => {
        let account: MemberAccount | null;
        if (binding.member) account = await currentAccount(tx, binding, at);
        else {
          const found = await tx.memberAccount.findUnique({ where: { phone } });
          if (!found) return refused();
          await tx.$queryRaw`SELECT id FROM MemberAccount WHERE id = ${found.id} FOR UPDATE`;
          account = await tx.memberAccount.findUnique({ where: { id: found.id } });
        }
        if (!account || account.phone !== phone || account.erasedAt || account.blockedAt) return refused();
        const verified = await proof(tx, verificationToken, binding.member ? "password" : "reset", binding, phone, account.id, at);
        if (!verified) return invalid();
        // No old-password check and no password-history restriction: the verification proof is the authorization.
        const passwordHash = await hashPassword(password);
        if (verified.expiresAt <= new Date(now())) return invalid();
        await tx.memberAccount.update({ where: { id: account.id }, data: { passwordHash, lastSignInAt: at } });
        await tx.memberVerification.update({ where: { id: verified.id }, data: { consumedAt: at } });
        return rotate(tx, account, binding, at);
      });
    },
  });
}
export type MemberAuth = ReturnType<typeof createMemberAuth>;
