import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { isCanonicalPhone } from "../../domain/phone.ts";

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
export function memberAdminCredential(environment: NodeJS.ProcessEnv = process.env): string | null {
  const password = environment.GOAL_HINT_ADMIN_PASSWORD;
  return password?.trim() && password.length >= 8 && password.length <= 128 && !/[\u0000-\u001f\u007f]/u.test(password) ? `plain:${password}` : null;
}

/** Compare fixed-length digests without changing the credential identity used by existing sessions. */
export function verifyMemberAdminCredential(password: string, credential: string): boolean {
  if (!credential.startsWith("plain:")) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(password), digest(credential.slice(6)));
}
