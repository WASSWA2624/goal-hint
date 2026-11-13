import { manualPaymentProvider, type ManualPaymentSettings, type SubscriptionSettings } from "./subscription-settings.ts";
import type { SupportContactSettings } from "./support-contacts.ts";
import { publicSupportContactSettings } from "./public-support-settings.ts";

export { publicSupportContactSettings, type PublicSupportSettings } from "./public-support-settings.ts";
export type PublicSubscriptionSettings = ManualPaymentSettings & Pick<SubscriptionSettings,
  "mtnMenuShortcut" | "airtelMenuShortcut" | "copyFormat" | "paymentNote" | "reviewTime"> & SupportContactSettings;

/** The payment form never receives owner message templates, disabled contacts, audit metadata, or retention policy. */
export function publicSubscriptionSettings(settings: SubscriptionSettings): PublicSubscriptionSettings {
  const mtn = manualPaymentProvider(settings, "mtn"), airtel = manualPaymentProvider(settings, "airtel");
  return { mtnEnabled: settings.mtnEnabled, mtnNumber: mtn.number, mtnName: mtn.name, mtnMenuShortcut: mtn.reason === null ? settings.mtnMenuShortcut : null,
    airtelEnabled: settings.airtelEnabled, airtelNumber: airtel.number, airtelName: airtel.name, airtelMenuShortcut: airtel.reason === null ? settings.airtelMenuShortcut : null,
    copyFormat: settings.copyFormat, paymentNote: settings.paymentNote, reviewTime: settings.reviewTime,
    ...publicSupportContactSettings(settings) };
}
