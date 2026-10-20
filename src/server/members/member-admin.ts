import "server-only";

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
