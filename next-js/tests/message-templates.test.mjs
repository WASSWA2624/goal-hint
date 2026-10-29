import assert from "node:assert/strict";
import test from "node:test";
import { defaultMessageTemplates, messageEvents, parseMessageTemplates, previewMessageValues, renderMessageTemplate, resolveMessageTemplates } from "../src/domain/message-templates.ts";
import { createYoolaMessaging } from "../src/server/members/yoola-messaging.ts";

const configuration = () => structuredClone(defaultMessageTemplates);
test("message settings round-trip with reviewed event and placeholder sources", () => {
  const parsed = parseMessageTemplates(configuration());
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.settings, defaultMessageTemplates);
  assert.deepEqual(resolveMessageTemplates(null), defaultMessageTemplates);
  for (const event of messageEvents) {
    const source = event.placeholders.map(key => `{{${key}}}`).join(" | ");
    assert.doesNotMatch(renderMessageTemplate(event.key, source, previewMessageValues(event.key)), /\{\{/u);
  }
});
test("the parser refuses foreign events, unsupported channels, unsafe placeholder sources and oversized settings", () => {
  for (const mutate of [
    value => { value.events.extra = value.events.welcome; },
    value => { value.events.welcome.channels = ["email"]; },
    value => { value.events["payment-approved"].sms = "Code {{verification_code}}"; },
    value => { value.events.welcome.sms = "Welcome {{process.env.SECRET}}"; },
    value => { value.events.welcome.sms = "Welcome {{account_url}"; },
    value => { value.events.welcome.sms = "x".repeat(1601); },
    value => { value.events.welcome.whatsapp.parameters = Array.from({ length: 21 }, () => "sample"); },
    value => { for (const event of Object.values(value.events)) event.whatsapp.parameters = Array.from({ length: 20 }, () => "x".repeat(1600)); },
  ]) {
    const input = configuration(); mutate(input); assert.equal(parseMessageTemplates(input).ok, false);
  }
});
test("verification templates require their code and lifetime and preserve member-selected delivery", () => {
  for (const mutate of [
    value => { value.events["account-verification"].enabled = false; },
    value => { value.events["account-verification"].channels = ["sms"]; },
    value => { value.events["account-verification"].sms = "Code {{verification_code}}"; },
    value => { value.events["password-reset"].whatsapp.templateName = "arbitrary"; },
    value => { value.events["password-reset"].whatsapp.parameters = ["{{phone}}", "{{verification_code}}"] },
  ]) { const input = configuration(); mutate(input); assert.equal(parseMessageTemplates(input).ok, false); }
});
test("transactional WhatsApp requires an approved template mapping, while SMS needs only text", () => {
  const input = configuration(), event = input.events["payment-approved"];
  event.channels = ["sms", "whatsapp"];
  assert.equal(parseMessageTemplates(input).ok, false);
  event.whatsapp = { templateName: "goal_hint_payment_approved", parameters: ["{{payment_reference}}", "{{account_url}}"] };
  assert.equal(parseMessageTemplates(input).ok, true);
});
test("the settings limit counts UTF-8 bytes and malformed non-JSON structures fail validation", () => {
  const input = configuration();
  for (const event of Object.values(input.events)) event.whatsapp.parameters = Array.from({ length: 2 }, () => "界".repeat(1500));
  assert.ok(JSON.stringify(input).length < 48 * 1024);
  assert.equal(parseMessageTemplates(input).ok, false);
  const cyclic = configuration(); cyclic.events.welcome.cycle = cyclic;
  assert.equal(parseMessageTemplates(cyclic).ok, false);
});
test("rendering rejects missing values and oversized expansion without executing content", () => {
  assert.throws(() => renderMessageTemplate("welcome", "Hello {{support_phone}}", {}), /unavailable/u);
  assert.throws(() => renderMessageTemplate("welcome", "{{account_url}}", { account_url: "a".repeat(1601) }), /exceeds/u);
  const value = "$(private) <script>alert(1)</script>";
  assert.equal(renderMessageTemplate("welcome", "{{account_url}}", { account_url: value }), value);
});
test("configured authentication messages use settings while only the explicitly chosen channel is sent", async () => {
  const messages = [], templates = configuration();
  templates.events["account-verification"].sms = "Your Goal Hint code is {{verification_code}}; expires in {{expiry_hours}} hours. Help: {{support_url}}";
  const messaging = createYoolaMessaging({ env: { YOOLA_SMS_API_KEY: "synthetic-key" },
    settings: async () => ({ messageTemplates: templates, contactPhone: null, whatsappPhone: null, trialDays: 2 }),
    fetch: async (url, options) => { messages.push({ url, body: JSON.parse(options.body) }); return Response.json({ status: "success" }); } });
  await messaging.send({ phone: "256700000111", channel: "sms", purpose: "account", code: "123456" });
  assert.equal(messages.length, 1); assert.match(messages[0].url, /\/send$/u);
  assert.match(messages[0].body.message, /Your Goal Hint code is 123456; expires in 24 hours/u);
  await messaging.send({ phone: "256700000111", channel: "whatsapp", purpose: "account", code: "654321" });
  assert.equal(messages.length, 2); assert.equal(messages[1].body.template_name, "yoola_otp_verification");
  assert.deepEqual(messages[1].body.template_params, ["654321"]); assert.equal(messages[1].body.consent, "yes");
});
test("WhatsApp account updates require explicit consent and are sent only as mapped template parameters", async () => {
  const calls = [], messaging = createYoolaMessaging({ env: { YOOLA_SMS_API_KEY: "synthetic-key" },
    fetch: async (url, options) => { calls.push(JSON.parse(options.body)); return Response.json({ status: "success" }); } });
  const message = { phone: "256700000111", templateName: "goal_hint_update", parameters: ["https://example.com/en/account"] };
  await assert.rejects(() => messaging.sendWhatsApp(message), /invalid/u); assert.equal(calls.length, 0);
  await messaging.sendWhatsApp({ ...message, consent: true });
  assert.equal(calls.length, 1); assert.deepEqual(calls[0].template_params, message.parameters);
  assert.equal(calls[0].consent, "yes"); assert.equal("message" in calls[0], false);
});
