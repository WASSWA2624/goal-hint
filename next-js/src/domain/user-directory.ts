import type { OwnerAccount } from "./owner-members.ts";
import { normalizePhone } from "./phone.ts";

export type UserAccess = "active" | "queued" | "none";
export type UserDirectoryAccount = OwnerAccount & Readonly<{ access: UserAccess }>;
export type UserDirectoryQuery = Readonly<{
  search: string;
  status: "all" | "open" | "blocked" | "erased";
  access: "all" | UserAccess;
  plan: string;
  recent: "all" | "1" | "7" | "30";
}>;
export const userDirectoryPageSize = 100;
export type UserDirectoryPaging = Readonly<{ page: number; pages: number; total: number }>;
export type UserDirectoryPage = UserDirectoryPaging & Readonly<{
  accounts: readonly UserDirectoryAccount[];
  asOf: string;
  hasMore?: boolean;
}>;
export type UserDirectoryCursor = Pick<UserDirectoryAccount, "id" | "lastSignInAt">;

export function parseUserDirectoryCursor(value: unknown): UserDirectoryCursor | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { id, lastSignInAt } = value as Partial<UserDirectoryCursor>;
  if (typeof id !== "string" || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/iu.test(id)
    || typeof lastSignInAt !== "string" || lastSignInAt.length !== 24 || !Number.isFinite(Date.parse(lastSignInAt))
    || new Date(lastSignInAt).toISOString() !== lastSignInAt) return null;
  return { id: id.toLowerCase(), lastSignInAt };
}

export const emptyUserDirectoryQuery: UserDirectoryQuery = Object.freeze({
  search: "", status: "all", access: "all", plan: "all", recent: "all",
});
const fields = new Set(["search", "status", "access", "plan", "recent"]);

export function parseUserDirectoryPage(value: unknown): number | null {
  if (value === undefined) return 1;
  const page = typeof value === "string" && /^[1-9]\d*$/u.test(value) ? Number(value) : value;
  return typeof page === "number" && Number.isSafeInteger(page) && page >= 1 ? page : null;
}

/** Validate the request once; legacy phone-only searches inherit the unfiltered defaults. */
export function parseUserDirectoryQuery(value: unknown): UserDirectoryQuery | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some(key => !fields.has(key)) || typeof input.search !== "string" || input.search.length > 120) return null;
  const query = { ...emptyUserDirectoryQuery, ...input };
  if (typeof query.status !== "string" || !["all", "open", "blocked", "erased"].includes(query.status)
    || typeof query.access !== "string" || !["all", "active", "queued", "none"].includes(query.access)
    || typeof query.recent !== "string" || !["all", "1", "7", "30"].includes(query.recent)
    || typeof query.plan !== "string" || !query.plan.trim() || query.plan.length > 40 || /[\u0000-\u001f\u007f]/u.test(query.plan)
    || /[\u0000-\u001f\u007f]/u.test(input.search)) return null;
  return { search: input.search.trim(), status: query.status as UserDirectoryQuery["status"],
    access: query.access as UserDirectoryQuery["access"], plan: query.plan.trim(), recent: query.recent as UserDirectoryQuery["recent"] };
}

/** Treat formatted phone fragments as one search term; text search accepts multiple words. */
export function userSearchTerms(search: string): readonly string[] {
  const trimmed = search.trim();
  if (!trimmed) return [];
  if (/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/iu.test(trimmed)) return [trimmed];
  if (/^[+\d\s().-]+$/u.test(trimmed)) {
    const digits = trimmed.replace(/\D/gu, "");
    if (!digits) return [];
    return [normalizePhone(trimmed) ?? (digits.startsWith("0") && !digits.startsWith("00") ? `256${digits.slice(1)}` : digits.replace(/^00/u, ""))];
  }
  return [...new Set(trimmed.split(/\s+/u))];
}

export function userDirectoryFiltered(query: UserDirectoryQuery): boolean {
  return !!query.search || query.status !== "all" || query.access !== "all" || query.plan !== "all" || query.recent !== "all";
}
