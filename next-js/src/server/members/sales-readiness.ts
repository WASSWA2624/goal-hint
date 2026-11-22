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

export function flutterwaveCheckoutPublished(settings: SubscriptionSettings | null | undefined, production: boolean): boolean {
  return !!settings && subscriptionCheckoutPublished(settings, production)
    && (!production || supportContactsOf(settings).some(contact => contact.showOnContactPage !== false && (contact.calls || contact.whatsapp)));
}

/** Every visible package must have a usable payment method. */
export function payableCheckoutPlans(plans: readonly SubscriptionPlanView[], settings: ManualPaymentSettings | null | undefined,
  availableWalletUgx: number, flutterwaveAvailable = false): readonly SubscriptionPlanView[] {
  const external = flutterwaveAvailable || hasManualPaymentProvider(settings);
  return plans.filter(plan => plan.active && (external || plan.priceUgx <= availableWalletUgx));
}
