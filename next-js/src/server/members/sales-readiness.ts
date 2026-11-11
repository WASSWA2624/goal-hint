import "server-only";

import { privacyNotice } from "../../domain/privacy-notice.ts";
import { supportContactsOf } from "../../domain/support-contacts.ts";
import type { SubscriptionSettings } from "../../domain/subscription-settings.ts";
import { termsNotice } from "../../domain/terms-notice.ts";

/** Published notices and a support contact are required for new production purchases. */
export function subscriptionCheckoutPublished(settings: SubscriptionSettings | null | undefined, production: boolean): boolean {
  return settings?.paywallMode === "on"
    && (!production || privacyNotice.releaseReady && termsNotice.releaseReady && supportContactsOf(settings).length > 0);
}
