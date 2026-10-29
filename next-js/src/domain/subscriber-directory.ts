import type { OwnerAccount } from "./owner-members.ts";
import { normalizePhone, type MobileNetwork } from "./phone.ts";

export type SubscriberAccess = "active" | "queued" | "none";
export type SubscriberDirectoryAccount = OwnerAccount & Readonly<{
  access: SubscriberAccess;
  planNames: readonly string[];
  network: MobileNetwork | null;
}>;
export type SubscriberDirectoryQuery = Readonly<{
  search: string;
  status: "all" | "open" | "blocked" | "erased";
  access: "all" | SubscriberAccess;
  plan: string;
  recent: "all" | "1" | "7" | "30";
}>;

export const emptySubscriberDirectoryQuery: SubscriberDirectoryQuery = Object.freeze({
  search: "", status: "all", access: "all", plan: "all", recent: "all",
});
const fields = new Set(["search", "status", "access", "plan", "recent"]);

/** Validate the request once; legacy phone-only searches inherit the unfiltered defaults. */
export function parseSubscriberDirectoryQuery(value: unknown): SubscriberDirectoryQuery | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some(key => !fields.has(key)) || typeof input.search !== "string" || input.search.length > 120) return null;
  const query = { ...emptySubscriberDirectoryQuery, ...input };
  if (typeof query.status !== "string" || !["all", "open", "blocked", "erased"].includes(query.status)
    || typeof query.access !== "string" || !["all", "active", "queued", "none"].includes(query.access)
    || typeof query.recent !== "string" || !["all", "1", "7", "30"].includes(query.recent)
    || typeof query.plan !== "string" || !query.plan.trim() || query.plan.length > 40 || /[\u0000-\u001f\u007f]/u.test(query.plan)
    || /[\u0000-\u001f\u007f]/u.test(input.search)) return null;
  return { search: input.search.trim(), status: query.status as SubscriberDirectoryQuery["status"],
    access: query.access as SubscriberDirectoryQuery["access"], plan: query.plan.trim(), recent: query.recent as SubscriberDirectoryQuery["recent"] };
}

/** Treat formatted phone fragments as one search term; text search accepts multiple words. */
export function subscriberSearchTerms(search: string): readonly string[] {
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

export function subscriberDirectoryFiltered(query: SubscriberDirectoryQuery): boolean {
  return !!query.search || query.status !== "all" || query.access !== "all" || query.plan !== "all" || query.recent !== "all";
}
