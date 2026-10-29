import type { OwnerAuditRow } from "./owner-members.ts";

const recordId = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/iu;
type AuditEventLink = Readonly<{ href: string; label: string }>;

/** Resolve the audited record before falling back to its subscriber account. */
export function auditEventLink(row: OwnerAuditRow): AuditEventLink | null {
  if (row.targetType === "payment" && recordId.test(row.targetId)) {
    const id = encodeURIComponent(row.targetId);
    return { href: `/admin/payments?paymentId=${id}#${id}`, label: "View payment" };
  }
  if (row.targetType === "settings") return { href: "/admin/settings", label: "Open settings" };
  if (row.targetType === "plan") {
    if (recordId.test(row.targetId)) return { href: `/admin/plans?planId=${encodeURIComponent(row.targetId)}`, label: "View plan" };
    return row.action === "plans_reordered" ? { href: "/admin/plans", label: "View plans" } : null;
  }
  if (row.targetType === "owner-session") return null;
  const accountId = row.accountId ?? (row.targetType === "member" ? row.targetId : null);
  if (accountId && recordId.test(accountId)) return { href: `/admin/subscribers?accountId=${encodeURIComponent(accountId)}`, label: "View subscriber" };
  return null;
}
