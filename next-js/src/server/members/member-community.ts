import "server-only";

import { communityReminderIntervalMs } from "../../domain/community.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import type { MemberIdentity } from "./member-sessions.ts";

type CommunityAction = Readonly<{ action: "status" | "reconcile" }>
  | Readonly<{ action: "claim" | "attempt" | "yes" | "no"; attemptId: string }>;

type CommunityOutcome = Readonly<{ status: "ok"; joined: boolean; invited?: boolean; retryAt?: string }>
  | Readonly<{ status: "refused" | "stale" }>;

function currentAccount(tx: Pick<Prisma.TransactionClient, "memberSession">, member: MemberIdentity, at: Date) {
  return tx.memberSession.findFirst({ where: { tokenHash: member.tokenHash, accountId: member.accountId,
    authenticatedAt: { not: null }, passwordResetAt: null, expiresAt: { gt: at },
    account: { phone: member.phone, blockedAt: null, erasedAt: null } },
    select: { account: { select: { communityJoinedAt: true, communityInvitedAt: true, communityInvitationId: true, communityAttemptId: true } } } });
}

export function createMemberCommunity({ database, now = Date.now }: { database: DatabaseRuntime; now?: () => number }) {
  return Object.freeze({
    async apply(member: MemberIdentity, action: CommunityAction, canInvite: boolean): Promise<CommunityOutcome> {
      if (member.blocked) return { status: "refused" };
      if (action.action === "status" || action.action === "claim" && !canInvite) {
        const current = await database.query(tx => currentAccount(tx, member, new Date(now())));
        if (!current) return { status: "refused" };
        return { status: "ok", joined: current.account.communityJoinedAt !== null,
          ...(action.action === "claim" ? { invited: false } : {}) };
      }

      return database.transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM MemberAccount WHERE id = ${member.accountId} FOR UPDATE`;
        const at = new Date(now());
        const current = await currentAccount(tx, member, at);
        if (!current) return { status: "refused" };
        const { account } = current, where = { id: member.accountId };
        if (account.communityJoinedAt) return { status: "ok", joined: true, ...(action.action === "claim" ? { invited: false } : {}) };

        if (action.action === "claim") {
          const retryAt = account.communityInvitedAt && account.communityInvitedAt.getTime() + communityReminderIntervalMs;
          if (retryAt !== null && retryAt > at.getTime()) {
            return { status: "ok", joined: false, invited: false, retryAt: new Date(retryAt).toISOString() };
          }
          await tx.memberAccount.update({ where, data: { communityInvitedAt: at, communityInvitationId: action.attemptId } });
          return { status: "ok", joined: false, invited: true };
        }

        if (action.action === "attempt") {
          if (account.communityAttemptId !== action.attemptId) {
            if (account.communityInvitationId !== action.attemptId) return { status: "stale" };
            await tx.memberAccount.update({ where, data: { communityAttemptId: action.attemptId } });
          }
          return { status: "ok", joined: false };
        }

        if (action.action === "yes" || action.action === "no") {
          if (account.communityAttemptId !== action.attemptId) return { status: "stale" };
          if (action.action === "no") {
            await tx.memberAccount.update({ where, data: { communityAttemptId: null,
              ...(account.communityInvitationId === action.attemptId ? { communityInvitationId: null } : {}) } });
            return { status: "ok", joined: false };
          }
        }

        await tx.memberAccount.update({ where, data: { communityJoinedAt: at, communityInvitedAt: null,
          communityInvitationId: null, communityAttemptId: null } });
        return { status: "ok", joined: true };
      }, { isolationLevel: "ReadCommitted" });
    },
  });
}

export type MemberCommunity = ReturnType<typeof createMemberCommunity>;
