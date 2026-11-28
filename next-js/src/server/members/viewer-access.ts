import "server-only";

import { cache } from "react";
import { cookies } from "next/headers.js";
import type { PaywallMode } from "../../domain/subscription-settings.ts";
import { renewalDue } from "../../domain/wallet.ts";
import { getAnalyticsServices, type AnalyticsServices } from "../analytics/analytics-http.ts";
import { analyticsSessionCookieName } from "../analytics/analytics-config.ts";
import { readCookie } from "../http/private-http.ts";
import { createAccessCodes } from "./access-codes.ts";
import { memberCookieName, memberSessionRules, memberTokenHash, validMemberToken } from "./member-sessions.ts";
import { isMemberAdminPhone, memberAdminCredential } from "./member-admin.ts";
import { hasMemberAdmission } from "./member-admission.ts";
import { accessMode, settingsServiceFor, type SettingsState } from "./settings.ts";
import { developmentMemberToken } from "../demo/member.ts";

export type ViewerAccess = Readonly<{ tier: "full" | "free"; signedIn: boolean; mode: PaywallMode | "free" }>;
export class ViewerAccessUnavailable extends Error {
  constructor() { super("Viewer access is temporarily unavailable."); }
}
type AccessRow = { accountId: string; phone: string; passwordHash: string | null; blockedAt: Date | null;
  phoneVerifiedAt: Date | null; memberAdmittedAt: Date | null; adminPasswordVersion: string | null; lastSeenAt: Date; entitled: number | bigint;
  canRenew: number | bigint | null; chainEnd: Date | null };

/** Confirmed Off mode opens protected features to eligible signed-in members. */
export function allowsContentWithoutSubscription(state: SettingsState | undefined, eligibleMember: boolean): boolean {
  return eligibleMember && state?.source !== "last-good" && state?.settings?.paywallMode === "off";
}

export function createViewerAccess({ services = getAnalyticsServices, settings, now = Date.now, failOnUnavailable = false }: {
  services?: () => Promise<AnalyticsServices>; settings?: () => Promise<SettingsState>; now?: () => number; failOnUnavailable?: boolean;
} = {}) {
  return async (cookieValue: (name: string) => string | undefined): Promise<ViewerAccess> => {
    let mode: ViewerAccess["mode"] = "free";
    try {
      const resolved = await services();
      const token = developmentMemberToken(cookieValue(memberCookieName(resolved.config.production)));
      const memberToken = validMemberToken(token) ? token : null;
      const policy = !settings && resolved.database ? settingsServiceFor(resolved.database) : null;
      // Guest visibility is independent of the switch. Only member decisions need a fresh policy read.
      const state = settings ? await settings() : await (memberToken ? policy?.currentFresh() : policy?.current())
        ?? { settings: null, source: "unavailable" } as const;
      mode = state.source === "last-good" && state.settings.paywallMode === "off" ? "free" : accessMode(state);
      const owner = cookieValue(resolved.config.cookies.session);
      if (owner && await resolved.auth?.verify(owner, { touch: false })) return { tier: "full", signedIn: false, mode };
      if (!resolved.database) {
        if (failOnUnavailable && memberToken) throw new ViewerAccessUnavailable();
        return { tier: "free", signedIn: false, mode };
      }
      let row: AccessRow | undefined;
      if (memberToken) {
        const hash = memberTokenHash(memberToken), database = resolved.database, at = new Date(now());
        const read = async (when: Date) => (await database.query((tx) => tx.$queryRaw<AccessRow[]>`
          SELECT s.accountId, s.lastSeenAt, s.adminPasswordVersion, a.phone, a.passwordHash, a.phoneVerifiedAt, a.memberAdmittedAt, a.blockedAt,
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
          : !row.passwordHash || !hasMemberAdmission(row))) row = undefined;
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
      const activeMember = row && !row.blockedAt ? row : null;
      const administrator = !!activeMember && isMemberAdminPhone(activeMember.phone);
      const entitled = Boolean(Number(activeMember?.entitled));
      if (failOnUnavailable && activeMember && !administrator && !state.settings) throw new ViewerAccessUnavailable();
      return { tier: administrator || allowsContentWithoutSubscription(state, !!activeMember) || state.settings && entitled ? "full" : "free",
        signedIn: !!row, mode };
    } catch {
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

const guestContentAccess = { tier: "free", signedIn: false, mode: "free" } as const;
function hasContentCredentials(read: (name: string) => string | undefined) {
  return developmentMemberToken(undefined) !== undefined || [true, false].some(secure =>
    Boolean(read(analyticsSessionCookieName(secure))) || validMemberToken(read(memberCookieName(secure))));
}

/** Public content projections only use tier and sign-in. Preference cookies cannot grant either. */
export function viewerContentAccessFromRequest(request: Request): Promise<ViewerAccess> {
  return hasContentCredentials(name => readCookie(request, name)) ? viewerAccessFromRequest(request) : Promise.resolve(guestContentAccess);
}

export async function resolveViewerContentAccessFresh(): Promise<ViewerAccess> {
  const jar = await cookies();
  const read = (name: string) => jar.get(name)?.value;
  return hasContentCredentials(read) ? resolve(read) : guestContentAccess;
}

export const resolveViewerContentAccess = cache(resolveViewerContentAccessFresh);
