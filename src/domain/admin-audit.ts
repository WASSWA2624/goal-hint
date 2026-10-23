import { toCsv } from "./analytics-csv.ts";
import type { OwnerAuditRow } from "./owner-members.ts";
import { publicPolicy } from "./public-policy.ts";

export const auditCategories = Object.freeze([
  { value: "security", label: "Sign-in & security" },
  { value: "accounts", label: "Accounts" },
  { value: "payments", label: "Payments" },
  { value: "access", label: "Access" },
  { value: "plans", label: "Plans" },
  { value: "settings", label: "Settings" },
  { value: "system", label: "System" },
  { value: "other", label: "Other" },
] as const);
export type AuditCategory = (typeof auditCategories)[number]["value"];
export type AuditPeriod = "all" | "today" | "7days" | "30days";
export type AuditFilters = Readonly<{ search?: string; category?: AuditCategory | ""; period?: AuditPeriod; now?: number }>;

type ActionDescription = Readonly<{ label: string; category: AuditCategory }>;
const descriptions: Readonly<Record<string, ActionDescription>> = Object.freeze({
  owner_signed_in: { label: "Administrator signed in", category: "security" },
  owner_signed_out: { label: "Administrator signed out", category: "security" },
  owner_sign_in_refused: { label: "Administrator sign-in refused", category: "security" },
  settings_changed: { label: "Settings updated", category: "settings" },
  settings_password_refused: { label: "Settings password refused", category: "security" },
  paywall_mode_changed: { label: "Paid access mode changed", category: "settings" },
  plan_created: { label: "Plan created", category: "plans" },
  plan_updated: { label: "Plan updated", category: "plans" },
  plan_activated: { label: "Plan activated", category: "plans" },
  plan_deactivated: { label: "Plan deactivated", category: "plans" },
  plans_reordered: { label: "Plans reordered", category: "plans" },
  code_created: { label: "Access period created", category: "access" },
  code_revoked: { label: "Access revoked", category: "access" },
  code_extended: { label: "Access extended", category: "access" },
  code_reissued: { label: "Access reissued", category: "access" },
  number_changed: { label: "Access moved to a new number", category: "accounts" },
  payment_approved: { label: "Payment approved", category: "payments" },
  payment_reversed: { label: "Payment reversed", category: "payments" },
  device_unlocked: { label: "Device access granted", category: "access" },
  device_evicted: { label: "Device access removed", category: "access" },
  access_granted: { label: "Access granted", category: "access" },
  trial_sent: { label: "Trial granted", category: "access" },
  trial_dismissed: { label: "Trial dismissed", category: "access" },
  member_note_changed: { label: "Account note updated", category: "accounts" },
  member_signed_out_all: { label: "All devices signed out", category: "security" },
  member_blocked: { label: "Account blocked", category: "accounts" },
  member_unblocked: { label: "Account unblocked", category: "accounts" },
  member_erased: { label: "Account erased", category: "accounts" },
  members_purged: { label: "Account data cleanup completed", category: "system" },
  password_reset: { label: "Temporary password set", category: "security" },
  payment_submitted: { label: "Payment submitted", category: "payments" },
  payment_rejected: { label: "Payment rejected", category: "payments" },
  payment_sms_attempted: { label: "Payment notification attempted", category: "payments" },
  trial_requested: { label: "Trial requested", category: "access" },
  uploads_busy: { label: "Payment upload limit reached", category: "system" },
});

const targetLabels: Readonly<Record<string, string>> = Object.freeze({
  "owner-session": "Administrator session", settings: "Settings", plan: "Plan", "access-code": "Access period",
  member: "Subscriber", "member-session": "Device", device: "Device", payment: "Payment",
  "member-verification": "Verification", "saved-slip": "Saved slip",
});
const opaqueIdentity = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{32,}|[A-Za-z0-9_-]{43})$/iu;

/** Unknown future events still read as words without exposing an opaque identifier as their title. */
function humanize(value: string, fallback: string): string {
  if (!value.trim() || opaqueIdentity.test(value.trim())) return fallback;
  const words = value.trim().replace(/([A-Z]+)([A-Z][a-z])/gu, "$1 $2").replace(/([a-z\d])([A-Z])/gu, "$1 $2")
    .replace(/[_-]+/gu, " ").split(/\s+/u).map(word => /^[A-Z]{2,}$/u.test(word) ? word : word.toLowerCase());
  const text = words.join(" ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : fallback;
}

function description(action: string): ActionDescription | undefined {
  return Object.hasOwn(descriptions, action) ? descriptions[action] : undefined;
}

export function auditActionLabel(action: string): string {
  return description(action)?.label ?? humanize(action, "Other event");
}

export function auditCategory(action: string): AuditCategory {
  return description(action)?.category ?? "other";
}

export function auditCategoryLabel(category: AuditCategory): string {
  return auditCategories.find(item => item.value === category)?.label ?? "Other";
}

export function auditTargetLabel(targetType: string): string {
  return Object.hasOwn(targetLabels, targetType) ? targetLabels[targetType]! : humanize(targetType, "Record");
}

export function auditActorLabel(actor: string): string {
  const value = actor.trim();
  if (/^(?:member-admin(?::|$)|admin$|administrator$|owner$)/iu.test(value)) return "Administrator";
  if (/^system(?::|$)/iu.test(value)) return "System";
  if (/^member(?::|$)/iu.test(value)) return "Subscriber";
  if (value === "deleted-admin") return "Former administrator";
  if (/^(?:unverified|anonymous)$/iu.test(value)) return "Unverified visitor";
  return !value || opaqueIdentity.test(value) ? "Unknown actor" : value;
}

/** Session identifiers are credentials or opaque device references, never useful exported record references. */
export function auditReference(row: Pick<OwnerAuditRow, "targetType" | "targetId">): string {
  if (row.targetType === "owner-session") return row.targetId === "admin" ? "Admin dashboard" : row.targetId === "analytics" ? "Analytics dashboard" : "";
  if (/session|device|settings/iu.test(row.targetType)) return "";
  return row.targetId === "daily-upload-ceiling" ? "Daily upload limit" : row.targetId;
}

const dateFormat = new Intl.DateTimeFormat("en-CA", { timeZone: publicPolicy.reportingTimeZone,
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
function dateParts(at: string): Record<string, string> | null {
  const date = new Date(at);
  if (!Number.isFinite(date.getTime())) return null;
  return Object.fromEntries(dateFormat.formatToParts(date).map(({ type, value }) => [type, value]));
}

export function auditDay(at: string): string {
  const parts = dateParts(at);
  return parts ? `${parts.year!.padStart(4, "0")}-${parts.month}-${parts.day}` : "";
}

const searchable = (value: string) => value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();

/** Filters only the rows already loaded; the source order and source objects stay intact. */
export function filterAuditRows(rows: readonly OwnerAuditRow[], { search = "", category = "", period = "all", now = Date.now() }: AuditFilters = {}): readonly OwnerAuditRow[] {
  const terms = searchable(search).trim().split(/\s+/u).filter(Boolean);
  const limited = period !== "all", current = new Date(now);
  const today = limited && Number.isFinite(current.getTime()) ? auditDay(current.toISOString()) : "";
  const dayLimit = period === "today" ? 0 : period === "7days" ? 6 : 29;
  const todayNumber = today ? Date.parse(`${today}T00:00:00Z`) / 86_400_000 : NaN;
  return rows.filter(row => {
    const rowCategory = auditCategory(row.action);
    if (category && rowCategory !== category) return false;
    if (limited) {
      const at = Date.parse(row.at), day = auditDay(row.at);
      const difference = todayNumber - Date.parse(`${day}T00:00:00Z`) / 86_400_000;
      if (!Number.isFinite(difference) || at > now || difference < 0 || difference > dayLimit) return false;
    }
    if (!terms.length) return true;
    const text = searchable([auditActionLabel(row.action), auditCategoryLabel(rowCategory), auditActorLabel(row.actor),
      auditTargetLabel(row.targetType), auditReference(row), row.targetId, row.accountId ?? "", row.id].join(" "));
    return terms.every(term => text.includes(term));
  });
}

/** Also neutralize whitespace-prefixed formulas in opaque record references before shared CSV serialization. */
function exportText(value: string | null): string {
  return value && /^(?:[\t\r\n]|\s*[=+\-@])/u.test(value) ? `'${value}` : value ?? "";
}

/** Export exactly the filtered loaded rows supplied by the caller, never arbitrary audit details. */
export function auditCsv(rows: readonly OwnerAuditRow[]): string {
  const columns = [
    { header: "Date (EAT)", value: (row: OwnerAuditRow) => {
      const parts = dateParts(row.at);
      return parts ? `${auditDay(row.at)} ${parts.hour}:${parts.minute}:${parts.second}` : "";
    } },
    { header: "Category", value: (row: OwnerAuditRow) => auditCategoryLabel(auditCategory(row.action)) },
    { header: "Event", value: (row: OwnerAuditRow) => auditActionLabel(row.action) },
    { header: "Performed by", value: (row: OwnerAuditRow) => auditActorLabel(row.actor) },
    { header: "Target", value: (row: OwnerAuditRow) => auditTargetLabel(row.targetType) },
    { header: "Reference", value: auditReference },
    { header: "Account", value: (row: OwnerAuditRow) => row.accountId },
    { header: "Event ID", value: (row: OwnerAuditRow) => row.id },
  ];
  return toCsv(columns.map(column => ({ header: column.header, value: (row: OwnerAuditRow) => exportText(column.value(row)) })), rows);
}
