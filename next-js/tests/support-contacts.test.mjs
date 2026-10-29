import assert from "node:assert/strict";
import test from "node:test";
import { parseSupportContacts, supportContactsOf } from "../src/domain/support-contacts.ts";
import { copiedPaymentPhone } from "../src/domain/copied-payment-phone.ts";
import { publicSubscriptionSettings, publicSupportContactSettings } from "../src/domain/public-subscription-settings.ts";
import { defaultSubscriptionSettings } from "../src/domain/subscription-settings.ts";

// Invented numbers only. No delivery provider or external messaging service is called.
const contact = (changes = {}) => ({ id: "mtn-support", label: "MTN support", network: "mtn", phone: "0772 123 456",
  calls: true, whatsapp: false, enabled: true, primary: true, ...changes });
const legacy = { contactPhone: "256772123456", whatsappPhone: "256752123456" };

test("support contacts normalize numbers and labels while preserving chosen contact methods", () => {
  const parsed = parseSupportContacts([contact({ label: "  Customer care  ", whatsapp: true })]);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.contacts, [contact({ label: "Customer care", phone: "256772123456", whatsapp: true })]);
  assert.ok(Object.isFrozen(parsed.contacts));
  assert.ok(Object.isFrozen(parsed.contacts[0]));
  assert.deepEqual(parseSupportContacts([]), { ok: true, contacts: [] });
});

test("support contacts reject ambiguous identities, invalid numbers, and incomplete methods", () => {
  for (const contacts of [
    null, {}, Array.from({ length: 9 }, (_, i) => contact({ id: `support-${i}` })),
    [null], [contact({ id: "" })], [contact({ label: "" })], [contact({ label: "a".repeat(49) })],
    [contact({ label: "Support\nNumber" })], [contact({ network: "unknown" })], [contact({ phone: "1234" })],
    [contact({ phone: "+254202012345" })], [contact({ calls: "yes" })], [contact({ calls: false, whatsapp: false })],
    [contact({ unexpected: true })],
    [contact(), contact({ phone: "0752 123 456" })],
    [contact(), contact({ id: "duplicate-number", phone: "+256772123456", primary: false })],
    [contact(), contact({ id: "second-primary", phone: "0752 123 456" })],
  ]) {
    const parsed = parseSupportContacts(contacts);
    assert.equal(parsed.ok, false, JSON.stringify(contacts));
    assert.ok(parsed.error);
  }
});

test("enabled contact ordering honors the primary number without mutating saved order", () => {
  const secondary = contact({ id: "airtel-support", phone: "256752123456", network: "airtel", primary: false });
  const primary = contact({ phone: "256772123456" });
  const hidden = contact({ id: "hidden", phone: "256782123456", enabled: false });
  const settings = { ...legacy, supportContacts: [secondary, hidden, primary] };
  assert.deepEqual(supportContactsOf(settings).map(item => item.id), ["mtn-support", "airtel-support"]);
  assert.deepEqual(settings.supportContacts.map(item => item.id), ["airtel-support", "hidden", "mtn-support"]);
  assert.equal(parseSupportContacts([primary, hidden]).ok, true);
});

test("legacy routes survive migration but an explicit empty or disabled list stays empty", () => {
  assert.deepEqual(supportContactsOf(legacy).map(({ phone, calls, whatsapp, primary }) => ({ phone, calls, whatsapp, primary })), [
    { phone: legacy.contactPhone, calls: true, whatsapp: false, primary: true },
    { phone: legacy.whatsappPhone, calls: false, whatsapp: true, primary: false },
  ]);
  assert.deepEqual(supportContactsOf({ ...legacy, supportContacts: null }), supportContactsOf(legacy));
  const combined = supportContactsOf({ contactPhone: legacy.contactPhone, whatsappPhone: legacy.contactPhone });
  assert.equal(combined.length, 1);
  assert.equal(combined[0].calls, true);
  assert.equal(combined[0].whatsapp, true);
  assert.deepEqual(supportContactsOf({ ...legacy, supportContacts: [] }), []);
  assert.deepEqual(supportContactsOf({ ...legacy, supportContacts: [contact({ enabled: false })] }), []);
});

test("desktop payment copy follows settings while phone copying keeps its existing local format", () => {
  assert.equal(copiedPaymentPhone("256772123456", "international", true), "256772123456");
  assert.equal(copiedPaymentPhone("256772123456", "local", true), "0772123456");
  assert.equal(copiedPaymentPhone("256772123456", "international", false), "0772123456");
  assert.equal(copiedPaymentPhone("256772123456", "local", false), "0772123456");
  assert.equal(copiedPaymentPhone("254712345678", "local", true), "254712345678");
});

test("public settings expose an explicit payment field list and enabled contact methods only", () => {
  const enabled = contact({ phone: "256772123456", privateNote: "internal only" });
  const hidden = contact({ id: "private-number", phone: "256752123456", enabled: false, primary: false });
  const settings = { ...defaultSubscriptionSettings, ...legacy, supportContacts: [hidden, enabled], updatedBy: "private-owner",
    messageTemplates: { private: "owner message source" }, screenshotRetentionDays: 365,
    mtnNumber: "256782123456", copyFormat: "local", paymentNote: "Use the registered payment name.", reviewTime: "Usually within 30 minutes" };
  const projected = publicSubscriptionSettings(settings);
  assert.deepEqual(Object.keys(projected).sort(), ["mtnNumber", "mtnName", "mtnMenuShortcut", "airtelNumber", "airtelName", "airtelMenuShortcut",
    "copyFormat", "paymentNote", "reviewTime", "contactPhone", "whatsappPhone", "supportContacts"].sort());
  assert.equal(projected.contactPhone, enabled.phone);
  assert.equal(projected.mtnNumber, settings.mtnNumber);
  assert.equal(projected.copyFormat, "local");
  assert.equal(projected.paymentNote, settings.paymentNote);
  assert.equal(projected.reviewTime, settings.reviewTime);
  assert.equal(projected.whatsappPhone, null, "A disabled contact never survives in a projected legacy method.");
  assert.deepEqual(projected.supportContacts.map(item => item.id), [enabled.id]);
  assert.equal("privateNote" in projected.supportContacts[0], false);
  assert.doesNotMatch(JSON.stringify(projected), /private-owner|owner message source|private-number|256752123456|internal only/);
  assert.deepEqual(publicSupportContactSettings({ ...legacy, supportContacts: [] }), { contactPhone: null, whatsappPhone: null, supportContacts: [] });
  assert.deepEqual(publicSupportContactSettings(null), { contactPhone: null, whatsappPhone: null, supportContacts: [] });
});
