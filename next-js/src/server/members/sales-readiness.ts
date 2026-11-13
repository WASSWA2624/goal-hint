import "server-only";

import { privacyNotice } from "../../domain/privacy-notice.ts";
import { supportContactsOf } from "../../domain/support-contacts.ts";
import type { SubscriptionSettings } from "../../domain/subscription-settings.ts";
import { termsNotice } from "../../domain/terms-notice.ts";
import type { AnalyticsConfig } from "../analytics/analytics-config.ts";

export type CheckoutRuntime = Partial<Pick<AnalyticsConfig, "production" | "staging">>;

/** An explicitly isolated staging release uses production runtime security without public sales publication. */
export function subscriptionCheckoutPublished(settings: SubscriptionSettings | null | undefined, runtime?: CheckoutRuntime): boolean {
  return settings?.paywallMode === "on"
    && (!runtime?.production || runtime.staging === true ||
      privacyNotice.releaseReady && termsNotice.releaseReady && supportContactsOf(settings).length > 0);
}
