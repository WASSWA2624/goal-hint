import { z } from "zod";

export const flutterwaveCustomerEmail = z.email().max(254);
export type FlutterwaveMode = "sandbox" | "live";

/** A sandbox-specific host is valid only for sandbox or an already-validated link in the browser. */
export function validFlutterwaveCheckoutUrl(value: string, mode?: FlutterwaveMode): boolean {
  if (value.length > 255 || /\s/u.test(value)) return false;
  try {
    const url = new URL(value);
    const validOrigin = url.origin === "https://checkout.flutterwave.com"
      || mode !== "live" && url.origin === "https://checkout-v2.dev-flutterwave.com";
    return validOrigin && !url.username && !url.password && !url.search && !url.hash
      && /^\/v3\/hosted\/pay\/[a-z\d_-]+\/?$/iu.test(url.pathname);
  } catch { return false; }
}
