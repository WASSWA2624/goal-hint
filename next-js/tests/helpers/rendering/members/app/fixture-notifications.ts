import { accountNotificationKinds, notificationCursor, type AccountNotification, type AccountNotificationPage } from "@/domain/account-notifications";
import type { MemberIdentity } from "@/server/members/member-sessions";

type Row = AccountNotification & { dismissed: boolean };
const globalStore = globalThis as typeof globalThis & { notificationFixtureRows?: Map<string, Row[]> };
const rows = globalStore.notificationFixtureRows ??= new Map();
function owned(member: MemberIdentity) {
  let value = rows.get(member.accountId);
  if (!value) {
    const at = Date.now();
    value = accountNotificationKinds.map((kind, index) => ({ id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      kind, occurredAt: new Date(at - index * 3_600_000).toISOString(), expiresAt: kind.startsWith("access-expir") ? new Date(at + (kind === "access-expired" ? -4 : 1) * 3_600_000).toISOString() : null,
      read: index === 0, dismissed: false }));
    rows.set(member.accountId, value);
  }
  return value;
}
export function fixtureNotifications(state = "active") {
  return {
    async read(member: MemberIdentity, before?: unknown, summary = false): Promise<AccountNotificationPage | null> {
      if (state === "notifications-unavailable") throw new Error("Synthetic notification outage");
      const all = state === "notifications-empty" ? [] : owned(member).filter(row => !row.dismissed), cursor = notificationCursor(before);
      const shown = cursor ? all.filter(row => row.occurredAt < cursor.at.toISOString() || row.occurredAt === cursor.at.toISOString() && row.id < cursor.id) : all;
      return { items: summary ? [] : shown.map(row => ({ id: row.id, kind: row.kind, occurredAt: row.occurredAt, expiresAt: row.expiresAt, read: row.read })), unread: all.filter(row => !row.read).length, next: null };
    },
    async update(member: MemberIdentity, action: "read" | "dismiss" | "read-all", id?: unknown) {
      const all = owned(member);
      if (action === "read-all") { for (const row of all) if (!row.dismissed) Object.assign(row, { read: true }); return true; }
      const row = all.find(row => row.id === id);
      if (!row) return false;
      Object.assign(row, { read: true, ...(action === "dismiss" ? { dismissed: true } : {}) }); return true;
    },
    async run() { return { checked: 0, failed: 0 }; },
  };
}
