import "server-only";
import { timingSafeEqual } from "node:crypto";
import { referralPath, referralRules, validReferralCode } from "../../domain/referrals.ts";
import type { AnalyticsConfig } from "../analytics/analytics-config.ts";
import { cookie, readCookie, redirect } from "../http/private-http.ts";
import { getMemberServices, type MemberServicesSource } from "./member-http.ts";

type Key = Pick<AnalyticsConfig, "key">;
export const referralCookieName = (production: boolean) => `${production ? "__Host-" : ""}goal-hint-referral`;
export function signReferralAttribution(config: Key, code: string, at: number): string {
  if (!validReferralCode(code) || !Number.isSafeInteger(at)) throw new RangeError("A valid referral and timestamp are required.");
  const payload = `${code}.${at}`;
  return `${payload}.${config.key("referral-attribution", payload)}`;
}
export function readReferralAttribution(config: Key, value: string | undefined, now: number): { code: string; at: number } | null {
  if (!value || value.length > 120) return null;
  const match = /^([a-f0-9]{32})\.([0-9]{13})\.([a-f0-9]{64})$/u.exec(value);
  if (!match) return null;
  const [, code, stamp, signature] = match, at = Number(stamp);
  if (at > now || now - at >= referralRules.attributionMs) return null;
  const expected = config.key("referral-attribution", `${code}.${stamp}`);
  return timingSafeEqual(Buffer.from(signature!, "hex"), Buffer.from(expected, "hex")) ? { code: code!, at } : null;
}

/** A valid first link wins for 30 days. The invite code never enters registration fields or redirect parameters. */
export function createReferralLinkHandler(source: MemberServicesSource = getMemberServices, now = Date.now) {
  return async (request: Request, code: string): Promise<Response> => {
    const destination = "/en/account?view=register";
    const target = request.headers.get("sec-fetch-dest"), purpose = request.headers.get("sec-purpose") ?? request.headers.get("purpose");
    if (!validReferralCode(code) || target && target !== "document" || purpose?.includes("prefetch")) return redirect(destination);
    try {
      const services = await source(), name = referralCookieName(services.config.production), at = now();
      if (readReferralAttribution(services.config, readCookie(request, name), at) || !await services.referrals?.inviter(code)) return redirect(destination);
      return redirect(destination, [cookie(services.config, name, signReferralAttribution(services.config, code, at), referralRules.attributionMs / 1000, "Lax")]);
    } catch { return redirect(destination); }
  };
}
export { referralPath };
