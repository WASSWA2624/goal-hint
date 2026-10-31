import "server-only";
import { randomUUID } from "node:crypto";
import { accountNotificationKinds, accountNotificationRules, notificationCursor, notificationId, subscriptionReminder,
  type AccountNotificationKind, type AccountNotificationPage } from "../../domain/account-notifications.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import { accessCodeTransaction, lockMemberAccount } from "./access-codes.ts";
import { isMemberAdminPhone } from "./member-admin.ts";
import type { MemberIdentity } from "./member-sessions.ts";

async function authorized(tx: Prisma.TransactionClient, member: MemberIdentity, at: Date) {
  if (member.blocked || member.administrator) return false;
  const account = await lockMemberAccount(tx, member.accountId);
  const session = await tx.memberSession.findUnique({ where: { tokenHash: member.tokenHash } });
  return !!account?.phone && account.phone === member.phone && !!account.passwordHash && !!account.phoneVerifiedAt
    && !account.blockedAt && !account.erasedAt && !isMemberAdminPhone(account.phone) && session?.accountId === account.id
    && !!session.authenticatedAt && !session.passwordResetAt && session.expiresAt > at;
}

/** Caller holds the account lock. Ledger facts remain authoritative; read/dismiss state is never reset. */
async function synchronize(tx: Prisma.TransactionClient, accountId: string, at: Date) {
  const since = new Date(+at - accountNotificationRules.retentionMs);
  const [payments, periods, rewards] = await Promise.all([
    tx.paymentSubmission.findMany({ where: { accountId, decidedAt: { gte: since, lte: at }, status: { in: ["approved", "rejected", "reversed"] } },
      select: { id: true, status: true, decidedAt: true } }),
    tx.accessCode.findMany({ where: { accountId, OR: [{ endsAt: { gte: since } }, { startsAt: { gte: since, lte: at } }] },
      select: { id: true, startsAt: true, endsAt: true, revokedAt: true } }),
    tx.memberReferral.findMany({ where: { inviterId: accountId, status: "rewarded", rewardedAt: { gte: since, lte: at } },
      select: { id: true, rewardedAt: true } }),
  ]);
  const candidates: Prisma.MemberNotificationCreateManyInput[] = [];
  function put(kind: AccountNotificationKind, eventKey: string, occurredAt: Date, expiresAt: Date | null = null) {
    candidates.push({ id: randomUUID(), accountId, eventKey, kind, occurredAt, createdAt: at, expiresAt });
  }
  for (const payment of payments) if (payment.decidedAt) {
    const kind = payment.status === "rejected" ? "payment-rejected" : "payment-approved";
    put(kind, `${kind}:${payment.id}`, payment.decidedAt);
  }
  for (const period of periods) if (period.startsAt >= since && period.startsAt <= at && (!period.revokedAt || period.revokedAt > period.startsAt)) {
    put("access-activated", `access-activated:${period.id}`, period.startsAt);
  }
  for (const reward of rewards) if (reward.rewardedAt) put("referral-earned", `referral-earned:${reward.id}`, reward.rewardedAt);
  const reminder = subscriptionReminder(periods, at);
  const key = reminder ? `${reminder.kind}:${+reminder.end}` : null;
  await tx.memberNotification.updateMany({ where: { accountId, kind: { in: ["access-expiring", "access-expired"] }, withdrawnAt: null, occurredAt: { lte: at },
    ...(key ? { eventKey: { not: key } } : {}) }, data: { withdrawnAt: at } });
  if (reminder) {
    put(reminder.kind, key!, reminder.occurredAt, reminder.end);
    await tx.memberNotification.updateMany({ where: { accountId, eventKey: key!, withdrawnAt: { not: null } }, data: { withdrawnAt: null } });
  }
  for (let offset = 0; offset < candidates.length; offset += 250) {
    await tx.memberNotification.createMany({ data: candidates.slice(offset, offset + 250), skipDuplicates: true });
  }
  await tx.memberNotification.deleteMany({ where: { accountId, occurredAt: { lt: since } } });
}

const visible = (accountId: string, at: Date) => ({ accountId, dismissedAt: null, withdrawnAt: null,
  occurredAt: { gte: new Date(+at - accountNotificationRules.retentionMs), lte: at } });

export function createAccountNotifications({ database, now = Date.now }: { database: DatabaseRuntime; now?: () => number }) {
  return Object.freeze({
    async read(member: MemberIdentity, before?: unknown, summary = false): Promise<AccountNotificationPage | null> {
      if (member.blocked || member.administrator) return null;
      const cursor = notificationCursor(before);
      return accessCodeTransaction(database, async tx => {
        const at = new Date(now());
        if (!await authorized(tx, member, at)) return null;
        await synchronize(tx, member.accountId, at);
        const where = visible(member.accountId, at);
        const unread = await tx.memberNotification.count({ where: { ...where, readAt: null } });
        const rows = summary ? [] : await tx.memberNotification.findMany({ where: { ...where,
          ...(cursor ? { OR: [{ occurredAt: { lt: cursor.at } }, { occurredAt: cursor.at, id: { lt: cursor.id } }] } : {}) },
          orderBy: [{ occurredAt: "desc" }, { id: "desc" }], take: accountNotificationRules.pageSize + 1,
          select: { id: true, kind: true, occurredAt: true, expiresAt: true, readAt: true } });
        const page = rows.slice(0, accountNotificationRules.pageSize), last = page.at(-1);
        return { unread, items: page.filter(row => accountNotificationKinds.includes(row.kind as AccountNotificationKind)).map(row => ({
          id: row.id, kind: row.kind as AccountNotificationKind, occurredAt: row.occurredAt.toISOString(), expiresAt: row.expiresAt?.toISOString() ?? null, read: !!row.readAt,
        })), next: rows.length > page.length && last ? `${last.occurredAt.toISOString()}_${last.id}` : null };
      });
    },
    async update(member: MemberIdentity, action: "read" | "dismiss" | "read-all", id?: unknown): Promise<boolean> {
      if (member.blocked || member.administrator || !["read", "dismiss", "read-all"].includes(action) || action !== "read-all" && !notificationId(id)) return false;
      return accessCodeTransaction(database, async tx => {
        const at = new Date(now());
        if (!await authorized(tx, member, at)) return false;
        const where = visible(member.accountId, at);
        if (action === "read-all") {
          await tx.memberNotification.updateMany({ where: { ...where, readAt: null }, data: { readAt: at } }); return true;
        }
        const owned = { accountId: member.accountId, id: id as string, occurredAt: where.occurredAt };
        const row = await tx.memberNotification.findFirst({ where: owned, select: { readAt: true, dismissedAt: true } });
        if (!row) return false;
        await tx.memberNotification.updateMany({ where: owned, data: {
          readAt: row.readAt ?? at, ...(action === "dismiss" ? { dismissedAt: row.dismissedAt ?? at } : {}),
        } });
        return true;
      });
    },
    async run() {
      const at = new Date(now()), result = { checked: 0, failed: 0 };
      // Retention also applies to accounts that cannot currently open their inbox.
      await database.query(tx => tx.memberNotification.deleteMany({ where: { occurredAt: { lt: new Date(+at - accountNotificationRules.retentionMs) } } }));
      let cursor = "";
      while (true) {
        const accounts = await database.query(tx => tx.memberAccount.findMany({ where: { id: { gt: cursor }, phone: { not: null },
          passwordHash: { not: null }, phoneVerifiedAt: { not: null }, erasedAt: null, blockedAt: null }, orderBy: { id: "asc" }, take: 100,
          select: { id: true, phone: true } }));
        for (const row of accounts) {
          if (isMemberAdminPhone(row.phone)) continue;
          result.checked++;
          try { await accessCodeTransaction(database, async tx => {
            const account = await lockMemberAccount(tx, row.id);
            if (account?.phone && account.passwordHash && account.phoneVerifiedAt && !account.blockedAt && !account.erasedAt && !isMemberAdminPhone(account.phone)) await synchronize(tx, account.id, at);
          }); } catch { result.failed++; }
        }
        if (accounts.length < 100) break;
        cursor = accounts.at(-1)!.id;
      }
      return result;
    },
  });
}
export type AccountNotificationsService = ReturnType<typeof createAccountNotifications>;

const services = new WeakMap<DatabaseRuntime, { maybeSweep(): void }>();
export function accountNotificationsFor(database: DatabaseRuntime) {
  let service = services.get(database);
  if (!service) {
    const notifications = createAccountNotifications({ database });
    let pending = false, checkedAt = -Infinity;
    service = { maybeSweep() {
      if (pending || Date.now() - checkedAt < accountNotificationRules.sweepMs) return;
      pending = true; checkedAt = Date.now();
      void notifications.run().catch(() => {}).finally(() => { pending = false; });
    } };
    services.set(database, service);
  }
  return service;
}
