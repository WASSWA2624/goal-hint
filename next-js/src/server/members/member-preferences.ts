import "server-only";

import type { DatabaseRuntime } from "../database/client.ts";
import type { MemberIdentity } from "./member-sessions.ts";

type PreferenceOutcome = Readonly<{ status: "saved"; whatsappNotificationsAt: string | null }> | Readonly<{ status: "refused" }>;

/** Recipient consent is an account preference; sign-in codes never opt a phone into future updates. */
export function createMemberPreferences({ database, now = Date.now }: { database: DatabaseRuntime; now?: () => number }) {
  return Object.freeze({
    async setWhatsAppNotifications(member: MemberIdentity, enabled: boolean): Promise<PreferenceOutcome> {
      if (member.blocked || member.administrator) return { status: "refused" };
      const at = new Date(now());
      return database.transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM MemberAccount WHERE id = ${member.accountId} FOR UPDATE`;
        const current = await tx.memberSession.findUnique({ where: { tokenHash: member.tokenHash }, include: { account: true } });
        if (!current || current.accountId !== member.accountId || !current.authenticatedAt || current.passwordResetAt || current.expiresAt <= at
          || current.account.blockedAt || current.account.erasedAt || !current.account.phoneVerifiedAt || !current.account.phone
          || current.account.phone !== member.phone) return { status: "refused" };
        const consent = enabled ? current.account.whatsappNotificationsAt ?? at : null;
        if (consent?.getTime() !== current.account.whatsappNotificationsAt?.getTime()) {
          await tx.memberAccount.update({ where: { id: member.accountId }, data: { whatsappNotificationsAt: consent } });
        }
        return { status: "saved", whatsappNotificationsAt: consent?.toISOString() ?? null };
      }, { isolationLevel: "ReadCommitted" });
    },
  });
}

export type MemberPreferences = ReturnType<typeof createMemberPreferences>;
