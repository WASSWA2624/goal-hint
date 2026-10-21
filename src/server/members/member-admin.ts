import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { isCanonicalPhone } from "../../domain/phone.ts";
import { isPasswordHash, verifyPassword } from "../analytics/analytics-password.ts";

/** Missing configuration is an empty allowlist; malformed configuration never grants a privilege. */
export function parseMemberAdminPhones(value: string | undefined): readonly string[] | null {
  if (value === undefined || !value.trim()) return [];
  if (value.length > 4096) return null;
  try {
    const phones: unknown = JSON.parse(value);
    if (!Array.isArray(phones) || phones.length > 100 || !phones.every((phone) => typeof phone === "string" && isCanonicalPhone(phone))) return null;
    return Object.freeze([...new Set(phones as string[])]);
  } catch { return null; }
}

export const memberAdminPhones = (environment: NodeJS.ProcessEnv = process.env): readonly string[] =>
  parseMemberAdminPhones(environment.GOAL_HINT_ADMIN_PHONES) ?? [];

/** Always consult current server configuration; a removed number cannot retain allowlist privileges. */
export const isMemberAdminPhone = (phone: unknown, environment: NodeJS.ProcessEnv = process.env): boolean =>
  typeof phone === "string" && isCanonicalPhone(phone) && memberAdminPhones(environment).includes(phone);

/** One private environment credential for configured administrator numbers; never a member-chosen password. */
export function memberAdminPasswordHash(environment: NodeJS.ProcessEnv = process.env): string | null {
  const value = environment.GOAL_HINT_ADMIN_PASSWORD_HASH;
  return value && isPasswordHash(value) ? value : null;
}

/** Hash configuration takes precedence. The password fallback supports existing private deployments. */
export function memberAdminCredential(environment: NodeJS.ProcessEnv = process.env): string | null {
  if (environment.GOAL_HINT_ADMIN_PASSWORD_HASH?.trim()) return memberAdminPasswordHash(environment);
  const password = environment.GOAL_HINT_ADMIN_PASSWORD;
  return password?.trim() && password.length >= 8 && password.length <= 128 && !/[\u0000-\u001f\u007f]/u.test(password) ? `plain:${password}` : null;
}

/** Compare fixed-length digests for the plain environment fallback; member passwords always use scrypt. */
export async function verifyMemberAdminCredential(password: string, credential: string): Promise<boolean> {
  if (!credential.startsWith("plain:")) return verifyPassword(password, credential);
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(password), digest(credential.slice(6)));
}
