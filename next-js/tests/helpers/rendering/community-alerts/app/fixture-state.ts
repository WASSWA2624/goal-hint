import { defaultSubscriptionSettings, protectedSettingFields, type SettingsPageData } from "@/domain/subscription-settings";
import type { CommunityLink } from "@/domain/community";

const globalState = globalThis as typeof globalThis & { communityAlertFixture?: { role: string; configured: boolean; settings: SettingsPageData["settings"] } };
export const fixture = globalState.communityAlertFixture ??= { role: "visitor", configured: true, settings: { ...defaultSubscriptionSettings } };
export const links: CommunityLink[] = [
  { type: "whatsapp-channel", url: "https://whatsapp.com/channel/TEST_ONLY_FIXTURE", enabled: true },
  { type: "telegram-channel", url: "https://t.me/TEST_ONLY_FIXTURE", enabled: true },
  { type: "whatsapp-group", url: "https://chat.whatsapp.com/TEST_ONLY_FIXTURE", enabled: true },
];
export const scope = "a".repeat(64);
export function settingsPage(): SettingsPageData {
  return { settings: fixture.settings, source: "defaults", protectedFields: protectedSettingFields,
    requirements: { test: [], on: [] }, diagnostics: { address: "synthetic", headers: [] } };
}
export const alertStatus = () => ({ scope, enabled: false, repeats: 1, events: [], endpoints: [], publicKey: null, transports: { web: false, fcm: false, windowsClosed: false } });
