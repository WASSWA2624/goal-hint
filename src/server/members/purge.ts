import "server-only";
import type { DatabaseRuntime } from "../database/client.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import { writeOwnerAudit } from "../admin/audit.ts";
import { lockMemberAccount } from "./access-codes.ts";
import { memberAdminPhones } from "./member-admin.ts";
const DAY = 86_400_000, HOUR = 3_600_000, BATCH = 100;
export type MembersPurgeResult = Readonly<{ claimed: boolean; images: number; sessions: number; buckets: number; accounts: number }>;
/** The database claim is shared by the web, CLI and every worker; no member metadata is deleted. */
export function createMembersPurge(database: DatabaseRuntime, now = Date.now) {
  async function run(): Promise<MembersPurgeResult> {
    const at = new Date(now()), hourAgo = new Date(+at - HOUR);
    await database.query(tx => tx.$executeRaw`INSERT INTO SubscriptionSettings (id, updatedAt, updatedBy) VALUES (1, ${at}, 'system:members-purge') ON DUPLICATE KEY UPDATE id = id`);
    const claimed = await database.query(tx => tx.$executeRaw`UPDATE SubscriptionSettings SET lastMembersPurgeAt = ${at}
      WHERE id = 1 AND (lastMembersPurgeAt IS NULL OR lastMembersPurgeAt <= ${hourAgo})`);
    const result = { claimed: claimed === 1, images: 0, sessions: 0, buckets: 0, accounts: 0 };
    if (!result.claimed) return result;
    try {
      const settings = await database.query(tx => tx.subscriptionSettings.findUniqueOrThrow({ where: { id: 1 }, select: { screenshotRetentionDays: true } }));
      const imageWhere: Prisma.PaymentSubmissionWhereInput = { imagePurgedAt: null, screenshot: { isNot: null }, OR: [
        { status: { in: ["approved", "reversed"] }, decidedAt: { lte: new Date(+at - settings.screenshotRetentionDays * DAY) } },
        { status: { in: ["rejected", "superseded"] }, decidedAt: { lte: new Date(+at - 7 * DAY) } },
      ] };
      async function drain(batch: () => Promise<number>) { let total = 0; for (let i = 0; i < 1000; i++) { const count = await batch(); total += count; if (count < BATCH) break; } return total; }
      result.images = await drain(() => database.transaction(async tx => {
        const selected = await tx.paymentSubmission.findMany({ where: imageWhere, select: { id: true, accountId: true }, orderBy: { id: "asc" }, take: BATCH });
        for (const id of [...new Set(selected.map(s => s.accountId))].sort()) await lockMemberAccount(tx, id);
        const rows = await tx.paymentSubmission.findMany({ where: { ...imageWhere, id: { in: selected.map(s => s.id) } }, select: { id: true } });
        const ids = rows.map(r => r.id);
        const removed = await tx.paymentScreenshot.deleteMany({ where: { submissionId: { in: ids } } });
        await tx.paymentSubmission.updateMany({ where: { id: { in: ids } }, data: { imagePurgedAt: at } });
        return removed.count;
      }, { isolationLevel: "ReadCommitted" }));
      result.sessions = await drain(() => database.query(tx => tx.$executeRaw`DELETE FROM MemberSession WHERE expiresAt <= ${at} LIMIT ${BATCH}`));
      await drain(() => database.query(tx => tx.$executeRaw`DELETE FROM MemberVerification WHERE expiresAt <= ${at} LIMIT ${BATCH}`));
      // New buckets carry their window end in lockedUntil. Legacy null markers retain a full day-sized window.
      result.buckets = await drain(() => database.query(tx => tx.$executeRaw`DELETE FROM RateLimitBucket
        WHERE windowStartedAt <= ${new Date(+at - DAY)} AND ((lockedUntil IS NOT NULL AND lockedUntil <= ${new Date(+at - DAY)})
          OR (lockedUntil IS NULL AND windowStartedAt <= ${new Date(+at - 2 * DAY)})) LIMIT ${BATCH}`));
      result.accounts = await drain(() => database.transaction(async tx => {
        const admins = memberAdminPhones();
        const where: Prisma.MemberAccountWhereInput = { passwordHash: null, ...(admins.length ? { phone: { notIn: [...admins] } } : {}),
          lastSignInAt: { lte: new Date(+at - 30 * DAY) }, submissions: { none: {} }, codes: { none: {} } };
        const rows = await tx.memberAccount.findMany({ where, select: { id: true }, orderBy: { id: "asc" }, take: BATCH });
        for (const row of rows) await lockMemberAccount(tx, row.id);
        return (await tx.memberAccount.deleteMany({ where: { ...where, id: { in: rows.map(r => r.id) } } })).count;
      }, { isolationLevel: "ReadCommitted" }));
      await database.query(tx => writeOwnerAudit(tx, { at, actor: "system", action: "members_purged", targetType: "settings", targetId: "1", details: { images: result.images, sessions: result.sessions, buckets: result.buckets, accounts: result.accounts } }));
      return result;
    } catch (error) {
      await database.query(tx => tx.subscriptionSettings.updateMany({ where: { id: 1, lastMembersPurgeAt: at }, data: { lastMembersPurgeAt: null } })).catch(() => {});
      throw error;
    }
  }
  let pending: Promise<MembersPurgeResult> | null = null, checkedAt = -Infinity;
  return { run, maybePurge() { if (pending || now() - checkedAt < 15 * 60_000) return; checkedAt = now(); pending = run().catch(() => ({ claimed: false, images: 0, sessions: 0, buckets: 0, accounts: 0 })).finally(() => { pending = null; }); } };
}
const services = new WeakMap<DatabaseRuntime, ReturnType<typeof createMembersPurge>>();
export function membersPurgeFor(database: DatabaseRuntime) { let service = services.get(database); if (!service) { service = createMembersPurge(database); services.set(database, service); } return service; }
