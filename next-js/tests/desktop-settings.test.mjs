import assert from "node:assert/strict";
import test from "node:test";
import { defaultSubscriptionSettings, parseSettingsChanges } from "../src/domain/subscription-settings.ts";
import { defaultMessageTemplates } from "../src/domain/message-templates.ts";
import { configuredSubscriptionSettings, createSettingsService } from "../src/server/members/settings.ts";
import { createSettingsHandlers } from "../src/server/admin/settings-http.ts";

const contact = (id, phone, extra = {}) => ({ id, label: `${id} support`, network: "other", phone,
  calls: true, whatsapp: false, enabled: true, primary: id === "mtn", ...extra });
const identity = { mtnNumber: "256700000901", mtnName: "TEST PAYEE", mtnMenuShortcut: null,
  airtelNumber: null, airtelName: null, airtelMenuShortcut: null, contactPhone: "256700000902", whatsappPhone: "256700000903" };
const authorized = { password: null, sessionAuthorized: true, confirm: async () => assert.fail("Verified owner session needs no password.") };

function harness(fields = {}, environment = null) {
  const state = { row: { ...structuredClone(defaultSubscriptionSettings), id: 1, updatedAt: new Date("2026-10-29T10:00:00Z"),
    updatedBy: "owner", ...fields }, audits: [] };
  const client = { $executeRaw: async () => 0, $queryRaw: async () => [{ id: 1 }],
    subscriptionSettings: { findUnique: async () => state.row, findUniqueOrThrow: async () => state.row,
      update: async ({ data }) => (Object.assign(state.row, structuredClone(data)), state.row) },
    subscriptionPlan: { count: async () => 1 },
    ownerAuditEvent: { create: async ({ data }) => state.audits.push(data) } };
  const database = { query: async run => run(client), transaction: async run => {
    const before = structuredClone(state);
    try { return await run(client); } catch (error) { Object.assign(state, before); throw error; }
  } };
  return { state, database, service: createSettingsService(database, { environment, readiness: () => ({ privacy: true, terms: true }) }) };
}

test("configured support is a fallback until an explicit directory projects its primary call and WhatsApp routes", () => {
  const settings = { ...defaultSubscriptionSettings };
  assert.equal(configuredSubscriptionSettings(settings, identity).contactPhone, identity.contactPhone);
  const contacts = [contact("airtel", "256700000904"), contact("mtn", "256700000905", { whatsapp: true })];
  const resolved = configuredSubscriptionSettings({ ...settings, supportContacts: contacts }, identity);
  assert.equal(resolved.contactPhone, contacts[1].phone);
  assert.equal(resolved.whatsappPhone, contacts[1].phone);
  assert.equal(resolved.mtnNumber, identity.mtnNumber);
  assert.equal(configuredSubscriptionSettings({ ...settings, supportContacts: [] }, identity).contactPhone, null);
});

test("structured settings reject malformed contacts and unavailable event variables before writing", async () => {
  const { state, service } = harness();
  assert.equal(parseSettingsChanges({ supportContacts: [contact("mtn", "invalid")] }).ok, false);
  const templates = structuredClone(defaultMessageTemplates);
  templates.events["payment-approved"].sms = "Your code is {{verification_code}}";
  const result = await service.save("owner", { messageTemplates: templates }, authorized);
  assert.equal(result.status, "invalid");
  assert.match(result.errors.messageTemplates, /placeholder/u);
  assert.equal(state.audits.length, 0);
  const unsafe = await service.save("owner", { supportContacts: [contact("mtn", "256700000904", { label: "1234-5678-9012" })] }, authorized);
  assert.equal(unsafe.status, "invalid");
  assert.match(unsafe.errors.supportContacts, /access code/u);
  assert.equal(state.audits.length, 0);
});

test("directory and templates require protected-save authorization and persist together with one audit", async () => {
  const { state, service } = harness({}, identity);
  const contacts = [contact("mtn", "256700000904", { whatsapp: true }), contact("airtel", "256700000905")];
  const templates = structuredClone(defaultMessageTemplates);
  templates.events["payment-approved"].sms = "Payment {{payment_reference}} approved. Open {{account_url}}.";
  const refused = await service.save("owner", { supportContacts: contacts, messageTemplates: templates }, { password: null, confirm: async () => assert.fail() });
  assert.equal(refused.status, "password-required");
  assert.equal(state.audits.length, 0);
  const saved = await service.save("owner", { supportContacts: contacts, messageTemplates: templates }, authorized);
  assert.equal(saved.status, "saved");
  assert.deepEqual(state.row.supportContacts, contacts);
  assert.equal(saved.settings.contactPhone, contacts[0].phone);
  assert.equal(saved.settings.whatsappPhone, contacts[0].phone);
  assert.equal((await service.current()).settings.messageTemplates.events["payment-approved"].sms, templates.events["payment-approved"].sms);
  assert.equal(state.audits.length, 1);
  assert.deepEqual(Object.keys(state.audits[0].details.changes), ["supportContacts", "messageTemplates"]);
  const unchanged = await service.save("owner", { supportContacts: structuredClone(contacts), messageTemplates: structuredClone(templates) }, authorized);
  assert.deepEqual(unchanged.changed, []);
  assert.equal(state.audits.length, 1);
});

test("an open subscription cannot lose its last usable support contact", async () => {
  const { state, service } = harness({ ...identity, paywallMode: "on", supportContacts: [contact("mtn", "256700000904")] });
  const result = await service.save("owner", { supportContacts: [] }, authorized);
  assert.equal(result.status, "requirements");
  assert.deepEqual(result.missing.map(item => item.key), ["contact"]);
  assert.equal(state.row.supportContacts.length, 1);
  assert.equal(state.audits.length, 0);
});

test("the settings endpoint accepts bounded UTF-8 template settings larger than ordinary admin bodies", async () => {
  const { database, service, state } = harness();
  const templates = structuredClone(defaultMessageTemplates);
  for (const [event, configuration] of Object.entries(templates.events)) {
    configuration.sms = "🙂".repeat(600) + (["account-verification", "password-reset"].includes(event) ? " {{verification_code}} {{expiry_hours}}" : " {{account_url}}");
  }
  const body = JSON.stringify({ action: "save", changes: { messageTemplates: templates } });
  assert.ok(Buffer.byteLength(body) > 16_384 && Buffer.byteLength(body) < 65_536);
  const handler = createSettingsHandlers({ service: () => service });
  const context = text => ({ services: { database }, owner: { username: "owner", memberAccountId: "verified-owner" },
    request: new Request("http://localhost/api/admin/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: text }) });
  assert.equal((await handler.POST(context(body))).status, 200);
  assert.equal(state.audits.length, 1);
  assert.equal((await handler.POST(context(" ".repeat(65_537)))).status, 413);
  assert.equal(state.audits.length, 1);
});
