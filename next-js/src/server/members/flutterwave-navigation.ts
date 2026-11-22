import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { subscriptionReturnPath } from "../../domain/member-navigation.ts";
import type { AnalyticsConfig } from "../analytics/analytics-config.ts";

type Sign = AnalyticsConfig["key"];
const returnPurpose = "flutterwave-return";

/** Only the selected provider mode can create checkout for the corresponding app origin. */
export function flutterwaveCheckoutOrigin(request: Request, mode: "sandbox" | "live" | null, hostedOrigin?: string | null): string | null {
  if (!mode) return null;
  const url = new URL(request.url), host = request.headers.get("host") ?? url.host;
  const origin = request.headers.get("origin");
  // Next may construct Request.url from its internal listening address. Use the
  // configured origin only when the request names the same virtual host.
  if (hostedOrigin) return host === new URL(hostedOrigin).host && (!origin || origin === hostedOrigin) ? hostedOrigin : null;
  if (mode !== "sandbox" || !["https:", "http:"].includes(url.protocol)) return null;
  if (!/^(?:localhost|127\.0\.0\.1|\[::1\])(?::[1-9]\d{0,4})?$/u.test(host)) return null;
  try {
    const localOrigin = new URL(`${url.protocol}//${host}`).origin;
    return !origin || origin === localOrigin ? localOrigin : null;
  } catch { return null; }
}

export function privateTokenMatches(value: string, expected: string): boolean {
  const digest = (text: string) => createHash("sha256").update(text).digest();
  return timingSafeEqual(digest(value), digest(expected));
}

/** Binds a provider redirect to this attempt and the original, allowlisted feature. */
export function flutterwaveReturnUrl(origin: string, reference: string, returnTo: unknown, sign: Sign): string {
  const destination = subscriptionReturnPath(returnTo);
  const url = new URL(`/api/payments/flutterwave/return/${reference}`, origin);
  if (destination) url.searchParams.set("return", destination);
  url.searchParams.set("state", sign(returnPurpose, JSON.stringify([reference, destination])));
  return url.toString();
}

export function validFlutterwaveReturn(reference: string, returnTo: string | null, state: string | null, sign: Sign): boolean {
  return !!state && state.length <= 128 && (!returnTo || !!subscriptionReturnPath(returnTo))
    && privateTokenMatches(state, sign(returnPurpose, JSON.stringify([reference, returnTo])));
}
