import "server-only";

import { privacyNotice } from "../../domain/privacy-notice.ts";
import { supportContactsOf } from "../../domain/support-contacts.ts";
import { hasManualPaymentProvider, type ManualPaymentSettings, type SubscriptionSettings } from "../../domain/subscription-settings.ts";
import type { SubscriptionPlanView } from "../../domain/subscription-plans.ts";
import { termsNotice } from "../../domain/terms-notice.ts";

/** Published notices and a support contact are required for new production purchases. */
export function subscriptionCheckoutPublished(settings: SubscriptionSettings | null | undefined, production: boolean): boolean {
  return settings?.paywallMode === "on"
    && (!production || privacyNotice.releaseReady && termsNotice.releaseReady && supportContactsOf(settings).length > 0);
}

/** Every visible package must have a usable transfer method or be payable in full from available wallet credit. */
export function payableCheckoutPlans(plans: readonly SubscriptionPlanView[], settings: ManualPaymentSettings | null | undefined,
  availableWalletUgx: number): readonly SubscriptionPlanView[] {
  const manual = hasManualPaymentProvider(settings);
  return plans.filter(plan => plan.active && (manual || plan.priceUgx <= availableWalletUgx));
}
