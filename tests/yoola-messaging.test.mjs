import assert from "node:assert/strict";
import test from "node:test";
import { messageChannels, passwordChangeWindowMs, supportedMessageChannels, verificationCodeLifetimeMs, verificationRequestLimit,
  verificationRequestWindowMs } from "../src/domain/member-verification.ts";
import { createYoolaMessaging, YoolaMessagingError } from "../src/server/members/yoola-messaging.ts";

const phone = "256700000001", code = "019732", apiKey = "synthetic-yoola-key";
const message = { phone, code, channel: "sms", purpose: "account" };
const success = () => Response.json({ status: "success", message_id: "synthetic-message" });
function fixture(overrides = {}) {
  const requests = [];
  const messaging = createYoolaMessaging({ env: { YOOLA_SMS_API_KEY: apiKey },
    fetch: async (url, options) => { requests.push({ url, ...options, payload: JSON.parse(options.body) }); return success(); }, ...overrides });
  return { messaging, requests };
}

test("shared verification windows are 24 hours and permit three requests", () => {
  for (const window of [verificationCodeLifetimeMs, verificationRequestWindowMs, passwordChangeWindowMs]) assert.equal(window, 86_400_000);
  assert.equal(verificationRequestLimit, 3);
});

test("published SMS and WhatsApp coverage is shared by validation and channel selection", () => {
  for (const number of [phone, "265990000001", "260970000001", "254700000001", "255700000001", "250780000001", "263770000001"]) {
    assert.deepEqual(supportedMessageChannels(number), messageChannels, number);
  }
  for (const prefix of ["211", "251", "243", "234", "233", "27", "237", "221", "225", "235", "226",
    "971", "1", "44", "91", "86", "81", "82", "65", "49", "33", "39", "34", "31", "61", "966", "965", "974", "60", "66", "63"]) {
    assert.deepEqual(supportedMessageChannels(`${prefix}700000001`), ["sms"], prefix);
  }
  for (const number of ["257700000001", "212700000001", "46700000001", "+256700000001", "0770000001", "256600000001", "2567", "", "256700000001,256700000002"]) {
    assert.deepEqual(supportedMessageChannels(number), [], number);
  }
  assert.ok(Object.isFrozen(supportedMessageChannels(phone)));
});

test("SMS uses the documented single-recipient JSON payload and optional approved sender", async () => {
  const { messaging, requests } = fixture({ env: { YOOLA_SMS_API_KEY: apiKey, YOOLA_SMS_SENDER: "GoalHint" } });
  await messaging.send(message);
  assert.equal(requests.length, 1);
  const request = requests[0];
  assert.equal(request.url, "https://yoolasms.com/api/v1/send");
  assert.equal(request.method, "POST");
  assert.equal(request.headers["Content-Type"], "application/json");
  assert.equal(request.redirect, "error");
  assert.equal(request.cache, "no-store");
  assert.ok(request.signal instanceof AbortSignal);
  assert.deepEqual(request.payload, { api_key: apiKey, phone, sender: "GoalHint",
    message: `Goal Hint account verification code: ${code}. Valid for 24 hours; only the latest code works. Do not share this code.` });
});

test("password reset SMS identifies its purpose and omits an unconfigured sender", async () => {
  const { messaging, requests } = fixture();
  await messaging.send({ ...message, purpose: "password-reset" });
  assert.match(requests[0].payload.message, /^Goal Hint password reset code: 019732\./u);
  assert.equal("sender" in requests[0].payload, false);
});

test("WhatsApp uses the official authentication template and records the selected channel consent", async () => {
  const { messaging, requests } = fixture();
  await messaging.send({ ...message, channel: "whatsapp" });
  assert.equal(requests[0].url, "https://yoolasms.com/api/v1/send-whatsapp");
  assert.deepEqual(requests[0].payload, { api_key: apiKey, phone, template_name: "yoola_otp_verification", template_params: [code], consent: "yes" });
});

test("configured delivery works in development and production for both channels", async () => {
  for (const NODE_ENV of ["development", "production", "test", undefined]) {
    for (const channel of messageChannels) {
      const { messaging, requests } = fixture({ env: { NODE_ENV, YOOLA_SMS_API_KEY: apiKey } });
      assert.equal(await messaging.send({ ...message, channel }), undefined);
      assert.equal(requests.length, 1, `${NODE_ENV}: ${channel}`);
      assert.equal(requests[0].payload.phone, phone);
      assert.equal(requests[0].url, `https://yoolasms.com/api/v1/${channel === "sms" ? "send" : "send-whatsapp"}`);
    }
  }
});

test("every environment requires configuration before any external request", async () => {
  for (const NODE_ENV of ["development", "production", "test", undefined]) {
    for (const credentials of [{}, { YOOLA_SMS_API_KEY: " " }, { YOOLA_SMS_API_KEY: apiKey, YOOLA_SMS_SENDER: "Goal Hint" }]) {
      const { messaging, requests } = fixture({ env: { NODE_ENV, ...credentials } });
      await assert.rejects(() => messaging.send(message), (error) => error instanceof YoolaMessagingError && error.code === "configuration");
      assert.deepEqual(requests, []);
    }
  }
});

test("invalid code, purpose, channel and unsupported destination never reach the provider", async () => {
  const { messaging, requests } = fixture();
  for (const changed of [{ code: "12345" }, { code: "1234567" }, { code: 123456 }, { code: "12a456" }, { code: "123456\n" }, { purpose: "login" }, { channel: "email" }]) {
    await assert.rejects(() => messaging.send({ ...message, ...changed }), (error) => error instanceof YoolaMessagingError && error.code === "invalid-message");
  }
  for (const changed of [{ phone: "257700000001" }, { phone: "447946001234", channel: "whatsapp" }, { phone: `${phone},256700000002` }]) {
    await assert.rejects(() => messaging.send({ ...message, ...changed }), (error) => error instanceof YoolaMessagingError && error.code === "unsupported-country");
  }
  assert.deepEqual(requests, []);
});

test("delivery rejects HTTP errors, malformed and error responses without leaking provider details or retrying", async () => {
  const secret = `${apiKey} ${phone} ${code}`;
  for (const respond of [() => new Response(secret, { status: 401 }), () => new Response(secret),
    () => Response.json({ status: "error", message: secret }), () => Response.json(null), () => Response.json({}),
    () => { throw new Error(secret); }]) {
    let calls = 0;
    const { messaging } = fixture({ fetch: async () => { calls++; return respond(); } });
    await assert.rejects(() => messaging.send(message), (error) => {
      assert.ok(error instanceof YoolaMessagingError);
      assert.equal(error.code, "delivery");
      for (const value of [apiKey, phone, code]) assert.equal(String(error).includes(value), false);
      assert.equal(error.cause, undefined);
      return true;
    });
    assert.equal(calls, 1);
  }
});

test("a queued provider acceptance succeeds without a second send", async () => {
  let calls = 0;
  const { messaging } = fixture({ fetch: async () => { calls++; return Response.json({ status: "queued" }, { status: 202 }); } });
  await messaging.send({ ...message, channel: "whatsapp" });
  assert.equal(calls, 1);
});
