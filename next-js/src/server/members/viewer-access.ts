import "server-only";

import { cache } from "react";
import { cookies } from "next/headers.js";
import type { PaywallMode } from "../../domain/subscription-settings.ts";
import { renewalDue } from "../../domain/wallet.ts";
import { getAnalyticsServices, type AnalyticsServices } from "../analytics/analytics-http.ts";
import { readCookie } from "../http/private-http.ts";
import { createAccessCodes } from "./access-codes.ts";
import { memberCookieName, memberSessionRules, memberTokenHash, validMemberToken } from "./member-sessions.ts";
import { isMemberAdminPhone, memberAdminCredential } from "./member-admin.ts";
import { accessMode, settingsServiceFor, type SettingsState } from "./settings.ts";
import { developmentMemberToken } from "../demo/member.ts";

export type ViewerAccess = Readonly<{ tier: "full" | "free"; signedIn: boolean; mode: PaywallMode | "free" }>;
export class ViewerAccessUnavailable extends Error {
  constructor() { super("Viewer access is temporarily unavailable."); }
}
type AccessRow = { accountId: string; phone: string; passwordHash: string | null; blockedAt: Date | null;
  phoneVerifiedAt: Date | null; adminPasswordVersion: string | null; lastSeenAt: Date; entitled: number | bigint;
  canRenew: number | bigint | null; chainEnd: Date | null };

/** Only a confirmed policy can grant access independently of a current subscription or administrator role. */
export function allowsContentWithoutSubscription(state: SettingsState | undefined, verifiedMember: boolean): boolean {
  const settings = state?.settings;
  return !!settings && state?.source !== "last-good" && (settings.paywallMode === "off" ||
    settings.paywallMode === "on" && settings.allowUnsubscribedMembers === true && verifiedMember);
}

export function createViewerAccess({ services = getAnalyticsServices, settings, now = Date.now, failOnUnavailable = false }: {
  services?: () => Promise<AnalyticsServices>; settings?: () => Promise<SettingsState>; now?: () => number; failOnUnavailable?: boolean;
} = {}) {
  return async (cookieValue: (name: string) => string | undefined): Promise<ViewerAccess> => {
    let mode: ViewerAccess["mode"] = "free";
    try {
      const resolved = await services();
      const state = settings ? await settings() : resolved.database ? await settingsServiceFor(resolved.database).current() : { settings: null, source: "unavailable" } as const;
      mode = state.source === "last-good" && state.settings.paywallMode === "off" ? "free" : accessMode(state);
      const owner = cookieValue(resolved.config.cookies.session);
      if (owner && await resolved.auth?.verify(owner, { touch: false })) return { tier: "full", signedIn: false, mode };
      const token = developmentMemberToken(cookieValue(memberCookieName(resolved.config.production))), at = new Date(now());
      if (!resolved.database) {
        if (mode === "off") return { tier: "full", signedIn: false, mode };
        if (failOnUnavailable && validMemberToken(token)) throw new ViewerAccessUnavailable();
        return { tier: "free", signedIn: false, mode };
      }
      let row: AccessRow | undefined;
      if (validMemberToken(token)) {
        const hash = memberTokenHash(token), database = resolved.database;
        const read = async (when: Date) => (await database.query((tx) => tx.$queryRaw<AccessRow[]>`
          SELECT s.accountId, s.lastSeenAt, s.adminPasswordVersion, a.phone, a.passwordHash, a.phoneVerifiedAt, a.blockedAt,
            (a.autoRenew AND a.creditUgx >= (SELECT p.priceUgx FROM SubscriptionPlan p WHERE p.id = a.autoRenewPlanId AND p.active)) AS canRenew,
            EXISTS (
              SELECT 1 FROM AccessCode c WHERE c.accountId = s.accountId AND c.revokedAt IS NULL AND c.startsAt <= ${when} AND c.endsAt > ${when}
            ) AS entitled,
            (SELECT MAX(c.endsAt) FROM AccessCode c WHERE c.accountId = s.accountId AND c.revokedAt IS NULL) AS chainEnd
          FROM MemberSession s JOIN MemberAccount a ON a.id = s.accountId
          WHERE s.tokenHash = ${hash} AND s.expiresAt > ${when} AND s.authenticatedAt IS NOT NULL AND s.passwordResetAt IS NULL
            AND a.erasedAt IS NULL AND a.phone IS NOT NULL LIMIT 1`))[0];
        row = await read(at);
        const adminPhone = row && isMemberAdminPhone(row.phone);
        // Allowlisting a phone cannot elevate a pre-existing member session. Password rotation also invalidates it.
        const adminHash = adminPhone ? memberAdminCredential() : null;
        if (row && (adminPhone ? !adminHash || row.adminPasswordVersion !== resolved.config.key("admin-password-version", adminHash)
          : !row.passwordHash || !row.phoneVerifiedAt)) row = undefined;
        // A period about to end renews from credit on the member's own visit, so the background job is never the only trigger.
        if (row && !row.blockedAt && !adminPhone && mode === "on" && Number(row.canRenew) && row.chainEnd && renewalDue(new Date(row.chainEnd), at)) {
          try { if (await createAccessCodes({ database, now }).renewDue(row.accountId) === "renewed") row = await read(new Date(now())); }
          catch { /* Access below reflects what is already granted. */ }
        }
        if (row && +at - +row.lastSeenAt >= memberSessionRules.touchAfterMs) {
          await resolved.database.query((tx) => tx.memberSession.updateMany({ where: { tokenHash: hash, expiresAt: { gt: at },
            lastSeenAt: { lte: new Date(+at - memberSessionRules.touchAfterMs) } },
          data: { lastSeenAt: at, expiresAt: new Date(+at + memberSessionRules.expiryMs) } }));
        }
      }
      const verifiedMember = row && !row.blockedAt ? row : null;
      const administrator = !!verifiedMember && isMemberAdminPhone(verifiedMember.phone);
      const entitled = Boolean(Number(verifiedMember?.entitled));
      if (failOnUnavailable && entitled && !administrator && !state.settings) throw new ViewerAccessUnavailable();
      return { tier: administrator || allowsContentWithoutSubscription(state, !!verifiedMember) || state.settings && entitled ? "full" : "free",
        signedIn: !!row, mode };
    } catch {
      if (mode === "off") return { tier: "full", signedIn: false, mode };
      if (failOnUnavailable) throw new ViewerAccessUnavailable();
      return { tier: "free", signedIn: false, mode };
    }
  };
}

const resolve = createViewerAccess();
// Polls retain their accepted screen through a 503. A real sign-out still returns a confirmed free projection.
const resolveRequest = createViewerAccess({ failOnUnavailable: true });
export const resolveViewerAccessFresh = async (): Promise<ViewerAccess> => {
  const jar = await cookies();
  return resolve((name) => jar.get(name)?.value);
};
export const resolveViewerAccess = cache(resolveViewerAccessFresh);
export const viewerAccessFromRequest = (request: Request) => resolveRequest((name) => readCookie(request, name));
