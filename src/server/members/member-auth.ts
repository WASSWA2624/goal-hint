import "server-only";

import { randomBytes, randomUUID } from "node:crypto";
import { normalizePhone } from "../../domain/phone.ts";
import type { AnalyticsConfig } from "../analytics/analytics-config.ts";
import { hashPassword, verifyPassword } from "../analytics/analytics-password.ts";
import { DatabaseOperationError, type DatabaseRuntime } from "../database/client.ts";
import type { MemberAccount, Prisma } from "../generated/prisma/client.ts";
import { lockMemberAccount } from "./access-codes.ts";
import { grantSessionAccess } from "./device-grants.ts";
import { issueMemberSession, memberTokenHash, validMemberToken, type MemberIdentity } from "./member-sessions.ts";
import { isMemberAdminPhone, memberAdminCredential, verifyMemberAdminCredential } from "./member-admin.ts";
import { passwordRecoveryRules } from "./password-recovery.ts";
import { createMemberRateLimit } from "./rate-limit.ts";
import { decide } from "./settings.ts";

export const memberAuthRules = Object.freeze({ passwordMin: 8, passwordMax: 128 });
export type AuthBinding = Readonly<{ member: MemberIdentity | null }>;
export type AuthFailure = Readonly<{ status: "invalid" | "unauthorized" | "busy" | "conflict"; message: string }>;
type AuthSuccess = Readonly<{ status: "authenticated"; token: string; phone: string; administrator?: boolean; requiresPasswordChange?: boolean }>;
const invalid = (message: string): AuthFailure => ({ status: "invalid", message });
const refused = (): AuthFailure => ({ status: "unauthorized", message: "We couldn't verify these details. Please try again." });
const reserved = (): AuthFailure => ({ status: "unauthorized", message: "This number is reserved." });
const wrongPassword = (): AuthFailure => ({ status: "unauthorized", message: "Your current password is incorrect." });
const busy = (): AuthFailure => ({ status: "busy", message: "Too many attempts. Please wait before trying again." });
const conflict = (): AuthFailure => ({ status: "conflict", message: "An account already exists, so please log in." });
export const validMemberPassword = (value: unknown): value is string => typeof value === "string"
  && value.length >= memberAuthRules.passwordMin && value.length <= memberAuthRules.passwordMax;
let dummyPasswordHash: Promise<string> | undefined;
const dummyHash = () => dummyPasswordHash ??= hashPassword(randomBytes(32).toString("base64url"));

/**
 * Phone + password for every member; configured administrator numbers use their environment credential. The owner's payment
 * approval, not the number, proves who controls an account; a forgotten password is reset by the owner only. Throttles
 * are durable; application restarts cannot reset attempts.
 */
export function createMemberAuth({ database, config, now = Date.now, adminPhone = isMemberAdminPhone, adminPasswordHash = memberAdminCredential }: {
  database: DatabaseRuntime; config: Pick<AnalyticsConfig, "key">; now?: () => number; adminPhone?: (phone: string) => boolean; adminPasswordHash?: () => string | null;
}) {
  const limit = createMemberRateLimit(database, config, now);
  const safeAddress = (address: string) => address === "unknown" ? "unresolved-address" : address;

  async function currentAccount(tx: Prisma.TransactionClient, binding: AuthBinding, at: Date): Promise<MemberAccount | null> {
    if (!binding.member) return null;
    const account = await lockMemberAccount(tx, binding.member.accountId);
    const session = await tx.memberSession.findUnique({ where: { tokenHash: binding.member.tokenHash } });
    return account && !account.blockedAt && !account.erasedAt && account.phone && (account.passwordHash || adminPhone(account.phone)) && session?.authenticatedAt
      && session.expiresAt > at && session.accountId === account.id ? account : null;
  }

  /** The signed-in member's current password, checked like a login (throttled per account, constant work) outside the
   * account lock. Returns the hash it matched, which the caller re-reads under the lock. */
  async function currentPassword(member: MemberIdentity | null, password: unknown): Promise<string | AuthFailure> {
    if (!member) return refused();
    if (typeof password !== "string" || !password || password.length > memberAuthRules.passwordMax) return wrongPassword();
    if (!await limit({ purpose: "current-password-account", value: member.accountId, maximum: 10, windowMs: 15 * 60_000 })) return busy();
    const stored = (await database.query((tx) => tx.memberAccount.findUnique({ where: { id: member.accountId }, select: { passwordHash: true } })))?.passwordHash ?? null;
    return await verifyPassword(password, stored ?? await dummyHash()) && stored ? stored : wrongPassword();
  }

  async function rotate(tx: Prisma.TransactionClient, account: MemberAccount, binding: AuthBinding, at: Date): Promise<AuthSuccess> {
    const old = binding.member ? await tx.memberSession.findUnique({ where: { tokenHash: binding.member.tokenHash } }) : null;
    await tx.memberSession.deleteMany({ where: { accountId: account.id } });
    const { token, session } = await issueMemberSession(tx, account.id, at, undefined, true);
    // A profile change keeps this device's paid access; otherwise a live period unlocks the new device under the cap.
    if (old?.codeEnteredAt && old.accessCodeId) await tx.memberSession.update({ where: { tokenHash: session.tokenHash },
      data: { codeEnteredAt: old.codeEnteredAt, accessCodeId: old.accessCodeId } });
    await grantSessionAccess(tx, { accountId: account.id, tokenHash: session.tokenHash, at, actor: "member" });
    return { status: "authenticated", token, phone: account.phone! };
  }

  return Object.freeze({
    async login(phoneInput: unknown, password: unknown, address: string, previous?: string): Promise<AuthSuccess | AuthFailure> {
      const phone = normalizePhone(phoneInput);
      if (!phone || typeof password !== "string" || password.length > memberAuthRules.passwordMax) return refused();
      if (!await limit({ purpose: "password-login-address", value: safeAddress(address), maximum: 30, windowMs: 15 * 60_000 })
        || !await limit({ purpose: "password-login-phone", value: phone, maximum: 10, windowMs: 15 * 60_000 })) return busy();
      const administrator = adminPhone(phone), credential = administrator ? adminPasswordHash() : null;
      const account = await database.query((tx) => tx.memberAccount.findUnique({ where: { phone } }));
      const temporary = !administrator && !!account?.temporaryPasswordHash;
      const stored = administrator ? credential : temporary ? account!.temporaryPasswordHash : account?.passwordHash;
      const matches = administrator && stored ? await verifyMemberAdminCredential(password, stored) : await verifyPassword(password, stored ?? await dummyHash());
      if (!matches || !stored || account?.erasedAt || account?.blockedAt) return refused();
      if (!administrator && !account) return refused();
      return decide<AuthSuccess | AuthFailure>(database, async (tx) => {
        const at = new Date(now());
        // Administrator accounts are provisioned by the configured credential, never through public registration.
        if (administrator && !account) await tx.memberAccount.upsert({ where: { phone }, create: { id: randomUUID(), phone, createdAt: at, lastSignInAt: at }, update: {} });
        const found = account ?? await tx.memberAccount.findUnique({ where: { phone } });
        const current = found ? await lockMemberAccount(tx, found.id) : null;
        if (!current || current.phone !== phone || current.blockedAt || current.erasedAt) return refused();
        if (administrator ? !adminPhone(phone) || adminPasswordHash() !== stored
          : temporary ? current.temporaryPasswordHash !== stored || !current.temporaryPasswordExpiresAt || current.temporaryPasswordExpiresAt <= at
            : current.passwordHash !== stored || !!current.temporaryPasswordHash) return refused();
        if (temporary) {
          // Consume the password under the account lock. This cookie can only complete a password change.
          await tx.memberAccount.update({ where: { id: current.id }, data: { temporaryPasswordHash: null, temporaryPasswordExpiresAt: null, lastSignInAt: at } });
          await tx.memberSession.deleteMany({ where: { accountId: current.id } });
          const { token, session } = await issueMemberSession(tx, current.id, at, previous);
          await tx.memberSession.update({ where: { tokenHash: session.tokenHash }, data: { passwordResetAt: at, expiresAt: new Date(+at + passwordRecoveryRules.resetSessionMs) } });
          return { status: "authenticated", token, phone, requiresPasswordChange: true };
        }
        const { token, session } = await issueMemberSession(tx, current.id, at, previous, true);
        if (administrator) await tx.memberSession.update({ where: { tokenHash: session.tokenHash },
          data: { adminPasswordVersion: config.key("admin-password-version", stored) } });
        await tx.memberAccount.update({ where: { id: current.id }, data: { lastSignInAt: at } });
        if (!administrator) await grantSessionAccess(tx, { accountId: current.id, tokenHash: session.tokenHash, at, actor: "member" });
        return { status: "authenticated", token, phone, ...(administrator ? { administrator: true } : {}) };
      });
    },

    /** Public registration never replaces an existing identity or provisions an administrator. */
    async register(phoneInput: unknown, password: unknown, binding: AuthBinding, address: string): Promise<AuthSuccess | AuthFailure> {
      const phone = normalizePhone(phoneInput), at = new Date(now());
      if (!phone || binding.member || !validMemberPassword(password)) return invalid("Enter a valid phone and a password of 8–128 characters.");
      if (!await limit({ purpose: "register-address", value: safeAddress(address), maximum: 10, windowMs: 3_600_000 })
        || !await limit({ purpose: "register-phone", value: phone, maximum: 5, windowMs: 3_600_000 })) return busy();
      if (adminPhone(phone)) return reserved();
      const passwordHash = await hashPassword(password);
      try {
        return await decide<AuthSuccess | AuthFailure>(database, async (tx) => {
          const existing = await tx.memberAccount.findUnique({ where: { phone }, select: { id: true } });
          if (existing) return conflict();
          const account = await tx.memberAccount.create({ data: { id: randomUUID(), phone, passwordHash, createdAt: at, lastSignInAt: at } });
          return rotate(tx, account, binding, at);
        });
      } catch (error) { if (error instanceof DatabaseOperationError && error.code === "constraint") return conflict(); throw error; }
    },

    /** A generic acknowledgement does not disclose whether the phone belongs to an account. */
    async requestPasswordReset(phoneInput: unknown, address: string): Promise<Readonly<{ status: "requested"; message: string }> | AuthFailure> {
      const phone = normalizePhone(phoneInput);
      if (!phone) return invalid("Enter a valid phone number with its country code.");
      if (!await limit({ purpose: "password-reset-address", value: safeAddress(address), maximum: 10, windowMs: 3_600_000 })
        || !await limit({ purpose: "password-reset-phone", value: phone, maximum: 3, windowMs: 3_600_000 })) return busy();
      if (!adminPhone(phone)) await database.query((tx) => tx.memberAccount.updateMany({ where: { phone, blockedAt: null, erasedAt: null, passwordResetRequestedAt: null },
        data: { passwordResetRequestedAt: new Date(now()) } }));
      return { status: "requested", message: "Your password reset request has been sent to the admin. Contact the admin to receive your temporary password." };
    },

    async passwordResetSession(token?: string): Promise<Readonly<{ phone: string }> | null> {
      if (!validMemberToken(token)) return null;
      const session = await database.query((tx) => tx.memberSession.findUnique({ where: { tokenHash: memberTokenHash(token) }, include: { account: true } }));
      return session?.passwordResetAt && !session.authenticatedAt && session.expiresAt > new Date(now()) && !session.account.blockedAt && !session.account.erasedAt
        && session.account.phone && !adminPhone(session.account.phone) ? { phone: session.account.phone } : null;
    },

    async resetPassword(password: unknown, token: string | undefined, address: string): Promise<AuthSuccess | AuthFailure> {
      if (!validMemberPassword(password)) return invalid("Use a password of 8–128 characters.");
      if (!validMemberToken(token)) return refused();
      if (!await limit({ purpose: "password-reset-complete", value: safeAddress(address), maximum: 10, windowMs: 15 * 60_000 })) return busy();
      const tokenHash = memberTokenHash(token), initial = await database.query(tx => tx.memberSession.findUnique({ where: { tokenHash } }));
      if (!initial) return refused();
      const passwordHash = await hashPassword(password);
      return decide<AuthSuccess | AuthFailure>(database, async tx => {
        const account = await lockMemberAccount(tx, initial.accountId), at = new Date(now());
        const session = await tx.memberSession.findUnique({ where: { tokenHash } });
        if (!account?.phone || account.blockedAt || account.erasedAt || adminPhone(account.phone) || !session?.passwordResetAt || session.authenticatedAt || session.expiresAt <= at) return refused();
        await tx.memberAccount.update({ where: { id: account.id }, data: { passwordHash, temporaryPasswordHash: null, temporaryPasswordExpiresAt: null, passwordResetRequestedAt: null, lastSignInAt: at } });
        return rotate(tx, account, { member: null }, at);
      });
    },

    /** The new number is not verified: the owner checks the payer against it at approval. */
    async changePhone(phoneInput: unknown, password: unknown, binding: AuthBinding): Promise<AuthSuccess | AuthFailure> {
      const phone = normalizePhone(phoneInput), at = new Date(now());
      if (!binding.member) return refused();
      if (adminPhone(binding.member.phone)) return invalid("Administrator credentials are managed in the environment.");
      if (!phone) return invalid("Enter a valid new phone number with its country code.");
      const checked = await currentPassword(binding.member, password);
      if (typeof checked !== "string") return checked;
      try {
        return await decide<AuthSuccess | AuthFailure>(database, async (tx) => {
          const account = await currentAccount(tx, binding, at);
          if (!account?.phone || account.passwordHash !== checked) return refused();
          // A password cannot establish ownership of a different privileged identity.
          if (phone !== account.phone && adminPhone(phone)) return reserved();
          const existing = await tx.memberAccount.findUnique({ where: { phone } });
          if (existing && existing.id !== account.id) return conflict();
          const updated = await tx.memberAccount.update({ where: { id: account.id }, data: { phone } });
          return rotate(tx, updated, binding, at);
        });
      } catch (error) { if (error instanceof DatabaseOperationError && error.code === "constraint") return conflict(); throw error; }
    },

    /** Signed in only: there is no self-service reset. Other devices are signed out and this one is rotated. */
    async changePassword(password: unknown, current: unknown, binding: AuthBinding): Promise<AuthSuccess | AuthFailure> {
      const at = new Date(now());
      if (!binding.member) return refused();
      if (adminPhone(binding.member.phone)) return invalid("Administrator credentials are managed in the environment.");
      if (!validMemberPassword(password)) return invalid("Use a password of 8–128 characters.");
      const checked = await currentPassword(binding.member, current);
      if (typeof checked !== "string") return checked;
      const passwordHash = await hashPassword(password);
      return decide<AuthSuccess | AuthFailure>(database, async (tx) => {
        const account = await currentAccount(tx, binding, at);
        if (!account || account.phone !== binding.member!.phone || account.passwordHash !== checked) return refused();
        await tx.memberAccount.update({ where: { id: account.id }, data: { passwordHash, lastSignInAt: at } });
        return rotate(tx, account, binding, at);
      });
    },
  });
}
export type MemberAuth = ReturnType<typeof createMemberAuth>;
