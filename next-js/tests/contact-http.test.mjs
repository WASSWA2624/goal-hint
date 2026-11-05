import assert from "node:assert/strict";
import test from "node:test";
import { createContactHandler } from "../src/server/members/contact-http.ts";
import { defaultSubscriptionSettings } from "../src/domain/subscription-settings.ts";

const contact = (id, phone, changes = {}) => ({ id, label: id, phone, network: "other", calls: true,
  whatsapp: true, enabled: true, primary: false, ...changes });

test("public contact response includes only contacts published on this page and the visible email", async () => {
  const settings = { ...defaultSubscriptionSettings, contactPageEmail: "support@example.test", contactPageEmailVisible: true,
    supportContacts: [contact("public", "256772123456"), contact("checkout-only", "256752123456", { showOnContactPage: false }),
      contact("hidden", "256782123456", { enabled: false })], updatedBy: "private-owner", messageTemplates: { private: "secret-template" } };
  const response = await createContactHandler(async () => ({ settings, source: "stored" }))();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("set-cookie"), null);
  const body = await response.json();
  assert.equal(body.email, settings.contactPageEmail);
  assert.equal(body.contactPhone, "256772123456");
  assert.deepEqual(body.supportContacts.map(item => item.id), ["public"]);
  assert.doesNotMatch(JSON.stringify(body), /checkout-only|256752123456|hidden|256782123456|private-owner|secret-template/);
});

test("saved visibility takes effect on the next contact read, including an explicitly empty directory", async () => {
  let settings = { ...defaultSubscriptionSettings, contactPageEmail: "support@example.test", contactPageEmailVisible: true,
    supportContacts: [contact("public", "256772123456")] };
  const handler = createContactHandler(async () => ({ settings, source: "stored" }));
  assert.equal((await (await handler()).json()).supportContacts.length, 1);
  settings = { ...settings, contactPageEmailVisible: false, supportContacts: settings.supportContacts.map(item => ({ ...item, showOnContactPage: false })) };
  assert.deepEqual(await (await handler()).json(), { email: null, contactPhone: null, whatsappPhone: null, supportContacts: [] });
});

test("unavailable or stale contact reads cannot restore hidden contacts", async () => {
  for (const read of [async () => null, async () => ({ settings: null, source: "unavailable" }),
    async () => ({ settings: defaultSubscriptionSettings, source: "last-good" }), async () => { throw new Error("private database details"); }]) {
    const response = await createContactHandler(read)();
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), { error: "Contact details are temporarily unavailable." });
  }
});
