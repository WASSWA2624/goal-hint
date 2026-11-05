import "server-only";
import { defaultSubscriptionSettings, parseSettingsChanges, protectedSettingFields, type SettingsPageData, type SubscriptionSettings } from "@/domain/subscription-settings";
import { publicContactPageSettings } from "@/domain/contact-page";

const supportContacts = [
  { id: "public", label: "Customer care", network: "mtn", phone: "256772123456", calls: true, whatsapp: true, enabled: true, primary: true },
  { id: "checkout", label: "Checkout only", network: "airtel", phone: "256752123456", calls: true, whatsapp: true, enabled: true, primary: false, showOnContactPage: false },
  { id: "hidden", label: "Hidden contact", network: "other", phone: "256782123456", calls: true, whatsapp: false, enabled: false, primary: false },
] as const;
const shared = globalThis as typeof globalThis & { contactPageFixture?: { settings: SubscriptionSettings; unavailable: boolean } };
function initial(): SubscriptionSettings {
  return { ...defaultSubscriptionSettings, contactPageEmail: "support@example.test", contactPageEmailVisible: true, supportContacts,
    updatedAt: "2026-11-05T08:00:00.000Z", updatedBy: "synthetic-owner" };
}
export function fixture() { return shared.contactPageFixture ??= { settings: initial(), unavailable: false }; }
export function publicFixture() { return publicContactPageSettings(fixture().settings); }
export function overview(): SettingsPageData {
  return { settings: fixture().settings, source: "stored", environmentFields: [], protectedFields: protectedSettingFields,
    requirements: { test: [], on: [] }, diagnostics: { address: "127.0.0.1", headers: [] } };
}
export function resetFixture() { shared.contactPageFixture = { settings: initial(), unavailable: false }; }
export function updateFixture(changes: unknown) {
  const parsed = parseSettingsChanges(changes);
  if (!parsed.ok) return parsed;
  fixture().settings = { ...fixture().settings, ...parsed.changes, updatedAt: new Date().toISOString() };
  return parsed;
}
