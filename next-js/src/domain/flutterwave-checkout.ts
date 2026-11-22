import { z } from "zod";

export const flutterwaveCustomerEmail = z.email().max(254);

/** Checkout links use Flutterwave's hosted v3 payment page. */
export function validFlutterwaveCheckoutUrl(value: string): boolean {
  if (value.length > 255 || /\s/u.test(value)) return false;
  try {
    const url = new URL(value);
    return url.origin === "https://checkout.flutterwave.com" && !url.username && !url.password && !url.search && !url.hash
      && /^\/v3\/hosted\/pay\/[a-z\d_-]+\/?$/iu.test(url.pathname);
  } catch { return false; }
}
