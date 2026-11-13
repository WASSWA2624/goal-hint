import assert from "node:assert/strict";
import test from "node:test";
import { contactNotice } from "../src/domain/contact-notice.ts";
import { contactPageEmailHref, parseContactPageEmail, parsePublicContactPageSettings, publicContactPageSettings } from "../src/domain/contact-page.ts";
import { defaultSubscriptionSettings, parseSettingsChanges, parseSupportContacts } from "../src/domain/subscription-settings.ts";
import { publicSupportContactSettings } from "../src/domain/public-subscription-settings.ts";
import { createSettingsService } from "../src/server/members/settings.ts";

const contact = (id, phone, fields = {}) => ({ id, phone, label: `${id} support`, network: "other", calls: true,
  whatsapp: true, enabled: true, primary: false, ...fields });
const authorized = { password: null, sessionAuthorized: true, confirm: async () => assert.fail("Verified session needs no password.") };

function harness(fields = {}) {
  const state = { row: { ...structuredClone(defaultSubscriptionSettings), id: 1, updatedAt: new Date("2026-11-05T09:00:00Z"),
    updatedBy: "owner", ...fields }, reads: 0, failing: false, audits: [] };
  const read = async () => { state.reads++; if (state.failing) throw new Error("Unavailable"); return state.row; };
  const client = { $executeRaw: async () => 0, $queryRaw: async () => [{ id: 1 }],
    subscriptionSettings: { findUnique: read, findUniqueOrThrow: read,
      update: async ({ data }) => (Object.assign(state.row, structuredClone(data)), state.row) },
    subscriptionPlan: { count: async () => 1 }, ownerAuditEvent: { create: async ({ data }) => state.audits.push(data) } };
  const database = { query: async run => run(client), transaction: async run => {
    const before = structuredClone(state);
    try { return await run(client); } catch (error) { Object.assign(state, before); throw error; }
  } };
  return { state, database, service: createSettingsService(database, { environment: null, readiness: () => ({ privacy: true, terms: true }) }) };
}

test("the approved mailbox is preserved by defaults, while unavailable settings never restore it", () => {
  assert.equal(defaultSubscriptionSettings.contactPageEmail, contactNotice.email);
  assert.equal(publicContactPageSettings(defaultSubscriptionSettings).email, contactNotice.email);
  assert.deepEqual(publicContactPageSettings(null), { email: null, contactPhone: null, whatsappPhone: null, supportContacts: [] });
  assert.equal(publicContactPageSettings({ ...defaultSubscriptionSettings, contactPageEmailVisible: false }).email, null);
  assert.equal(publicContactPageSettings({ ...defaultSubscriptionSettings, contactPageEmail: null }).email, null);
});

test("contact-page visibility is backward compatible and independent of support availability", () => {
  const legacy = contact("legacy", "256700000901"), pageHidden = contact("page-hidden", "256700000902", { showOnContactPage: false, primary: true });
  const globalHidden = contact("global-hidden", "256700000903", { enabled: false });
  const settings = { ...defaultSubscriptionSettings, contactPhone: "256700000999", whatsappPhone: "256700000998",
    supportContacts: [legacy, pageHidden, globalHidden], updatedBy: "private-owner" };
  const parsed = parseSupportContacts(settings.supportContacts);
  assert.equal(parsed.ok, true);
  assert.equal(Object.hasOwn(parsed.contacts[0], "showOnContactPage"), false, "Old rows preserve their shape.");
  assert.equal(parsed.contacts[1].showOnContactPage, false);
  const projected = publicContactPageSettings(settings);
  assert.deepEqual(projected.supportContacts.map(item => item.id), [legacy.id]);
  assert.equal(projected.contactPhone, legacy.phone);
  assert.equal(projected.whatsappPhone, legacy.phone);
  assert.doesNotMatch(JSON.stringify(projected), /256700000902|256700000903|256700000999|256700000998|private-owner|showOnContactPage/);
  assert.deepEqual(publicSupportContactSettings(settings).supportContacts.map(item => item.id), [pageHidden.id, legacy.id], "Checkout support remains available.");
  const allPageHidden = publicContactPageSettings({ ...settings, supportContacts: [pageHidden] });
  assert.deepEqual([allPageHidden.contactPhone, allPageHidden.whatsappPhone, allPageHidden.supportContacts], [null, null, []]);
  for (const showOnContactPage of [null, "false", 0, undefined]) {
    assert.equal(parseSupportContacts([contact("invalid", "256700000901", { showOnContactPage })]).ok, false);
  }
});

test("contact email validation accepts a single mailbox and prevents mailto header injection", () => {
  assert.deepEqual(parseSettingsChanges({ contactPageEmail: "  support+contact@example.org  ", contactPageEmailVisible: false }),
    { ok: true, changes: { contactPageEmail: "support+contact@example.org", contactPageEmailVisible: false } });
  for (const contactPageEmail of [null, "", "   "]) assert.equal(parseSettingsChanges({ contactPageEmail }).changes.contactPageEmail, null);
  for (const email of ["mailto:help@example.org", "Help <help@example.org>", "help@example.org?bcc=other@example.org", "help@example.org\r\nBcc: other@example.org",
    "help@example.org%0ABcc:other@example.org", "a..b@example.org", ".help@example.org", "help@example", "help@-example.org", "a".repeat(65) + "@example.org", 7, undefined]) {
    assert.equal(parseContactPageEmail(email).ok, false, String(email));
    assert.equal(parseSettingsChanges({ contactPageEmail: email }).ok, false, String(email));
  }
  const punctuated = "help?bcc=another&tag#part@example.org";
  assert.equal(parseContactPageEmail(punctuated).ok, true, "Valid mailbox punctuation is allowed.");
  const href = new URL(contactPageEmailHref(punctuated));
  assert.equal(href.protocol, "mailto:");
  assert.equal(href.search, "");
  assert.equal(href.hash, "");
  assert.equal(decodeURIComponent(href.pathname), punctuated);
  assert.equal(parseSettingsChanges({ contactPageEmailVisible: "false" }).ok, false);
});

test("public contact responses are decoded with an allowlist and no legacy number fallback", () => {
  const visible = contact("visible", "256700000901"), hidden = contact("hidden", "256700000902", { showOnContactPage: false });
  const decoded = parsePublicContactPageSettings({ email: "support@example.org", supportContacts: [visible, hidden],
    contactPhone: "256700000999", whatsappPhone: "256700000998", private: "discard" });
  assert.equal(decoded.email, "support@example.org");
  assert.equal(decoded.contactPhone, visible.phone);
  assert.doesNotMatch(JSON.stringify(decoded), /256700000902|256700000999|256700000998|discard/);
  for (const input of [null, [], {}, { email: 7, supportContacts: [] }, { email: "help@example.org?subject=hello", supportContacts: [] },
    { email: null, supportContacts: [{ ...visible, calls: "true" }] }]) assert.equal(parsePublicContactPageSettings(input), null);
});

test("email and page visibility saves require protected authorization and record one atomic audit", async () => {
  const { state, service } = harness();
  const changes = { contactPageEmail: "help@example.org", contactPageEmailVisible: false,
    supportContacts: [contact("help", "256700000901", { showOnContactPage: false })] };
  const denied = await service.save("owner", changes, { password: null, confirm: async () => assert.fail() });
  assert.equal(denied.status, "password-required");
  assert.deepEqual(new Set(denied.fields), new Set(Object.keys(changes)));
  assert.equal(state.audits.length, 0);
  const saved = await service.save("owner", changes, authorized);
  assert.equal(saved.status, "saved");
  assert.equal(saved.settings.contactPageEmail, changes.contactPageEmail);
  assert.equal(saved.settings.contactPageEmailVisible, false);
  assert.deepEqual(state.audits[0].details.changes.contactPageEmail, { from: contactNotice.email, to: changes.contactPageEmail });
  assert.deepEqual(state.audits[0].details.changes.contactPageEmailVisible, { from: true, to: false });
  assert.equal(state.audits.length, 1);
  assert.deepEqual(publicContactPageSettings((await service.currentFresh()).settings), { email: null, contactPhone: null, whatsappPhone: null, supportContacts: [] });
});

test("fresh contact settings read another process save immediately and never serve stale visibility on failure", async () => {
  const { database, state, service: viewer } = harness();
  const initial = await viewer.current();
  assert.equal(initial.settings.contactPageEmailVisible, true);
  const writer = createSettingsService(database, { environment: null });
  const saved = await writer.save("owner", { contactPageEmailVisible: false }, authorized);
  assert.equal(saved.status, "saved");
  assert.equal((await viewer.current()).settings.contactPageEmailVisible, true, "Other server still has its 30-second cache.");
  const fresh = await viewer.currentFresh();
  assert.equal(fresh.settings.contactPageEmailVisible, false);
  assert.equal(fresh.source, "stored");
  state.failing = true;
  assert.deepEqual(await viewer.currentFresh(), { settings: null, source: "unavailable" });
  assert.equal((await viewer.current()).settings.contactPageEmailVisible, true, "Contact polling does not change access-decision caching.");
});
