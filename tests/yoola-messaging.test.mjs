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
    message: `Goal Hint account verification code: ${code}. Valid for 24 hours. Do not share this code.` });
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

test("generic SMS preserves the message and uses the shared documented endpoint in every environment", async () => {
  const text = "Goal Hint: Your payment was approved. Subscription expires on 24 Oct 2026 at 15:00 EAT.";
  for (const NODE_ENV of ["development", "production", "test", undefined]) {
    const { messaging, requests } = fixture({ env: { NODE_ENV, YOOLA_SMS_API_KEY: ` ${apiKey} `, YOOLA_SMS_SENDER: " GoalHint " } });
    await messaging.sendSms({ phone, message: text });
    assert.equal(requests.length, 1);
    const request = requests[0];
    assert.equal(request.url, "https://yoolasms.com/api/v1/send");
    assert.equal(request.method, "POST");
    assert.deepEqual(request.headers, { "Content-Type": "application/json", Accept: "application/json" });
    assert.equal(request.redirect, "error");
    assert.equal(request.cache, "no-store");
    assert.ok(request.signal instanceof AbortSignal);
    assert.deepEqual(request.payload, { api_key: apiKey, phone, message: text, sender: "GoalHint" });
  }
});

test("generic SMS supports SMS-only countries and omits an unconfigured sender", async () => {
  const { messaging, requests } = fixture();
  const destination = "447946001234";
  await messaging.sendSms({ phone: destination, message: "Goal Hint: Your payment was rejected. Please contact the administrator." });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].payload.phone, destination);
  assert.equal("sender" in requests[0].payload, false);
});

test("generic SMS rejects blank, non-string, oversized and unsupported messages before external requests", async () => {
  const { messaging, requests } = fixture();
  for (const text of ["", " \t\n", 12345, null, undefined, "x".repeat(1_601)]) {
    await assert.rejects(() => messaging.sendSms({ phone, message: text }), (error) => error instanceof YoolaMessagingError && error.code === "invalid-message");
  }
  for (const destination of ["257700000001", "+256700000001", "0770000001", `${phone},256700000002`]) {
    await assert.rejects(() => messaging.sendSms({ phone: destination, message: "Payment approved." }), (error) => error instanceof YoolaMessagingError && error.code === "unsupported-country");
  }
  assert.deepEqual(requests, []);
  await messaging.sendSms({ phone, message: "x".repeat(1_600) });
  assert.equal(requests.length, 1);
});

test("generic SMS requires valid configuration in every environment", async () => {
  for (const NODE_ENV of ["development", "production", "test", undefined]) {
    for (const credentials of [{}, { YOOLA_SMS_API_KEY: " " }, { YOOLA_SMS_API_KEY: apiKey, YOOLA_SMS_SENDER: "Goal Hint" }]) {
      const { messaging, requests } = fixture({ env: { NODE_ENV, ...credentials } });
      await assert.rejects(() => messaging.sendSms({ phone, message: "Payment approved." }), (error) => error instanceof YoolaMessagingError && error.code === "configuration");
      assert.deepEqual(requests, []);
    }
  }
});

test("generic SMS safely redacts failures and never retries an uncertain delivery", async () => {
  const text = "Goal Hint: Payment rejected. Private payment note.";
  const secret = `${apiKey} ${phone} ${text}`;
  for (const respond of [() => new Response(secret, { status: 401 }), () => new Response(secret),
    () => Response.json({ status: "error", message: secret }), () => Response.json(null), () => Response.json({}),
    () => { throw new Error(secret); }]) {
    let calls = 0;
    const { messaging } = fixture({ fetch: async () => { calls++; return respond(); } });
    await assert.rejects(() => messaging.sendSms({ phone, message: text }), (error) => {
      assert.ok(error instanceof YoolaMessagingError);
      assert.equal(error.code, "delivery");
      for (const value of [apiKey, phone, text]) assert.equal(String(error).includes(value), false);
      assert.equal(error.cause, undefined);
      return true;
    });
    assert.equal(calls, 1);
  }
});

test("generic SMS accepts queued responses", async () => {
  let calls = 0;
  const { messaging } = fixture({ fetch: async () => { calls++; return Response.json({ status: "queued" }, { status: 202 }); } });
  await messaging.sendSms({ phone, message: "Payment approved." });
  assert.equal(calls, 1);
});

test("every failed provider response remains uncertain without assuming safe automatic retry semantics", async () => {
  const text = "Goal Hint: Your account has been updated.";
  for (const [respond, dispatch] of [
    [() => { throw new TypeError("Synthetic network failure"); }, "uncertain"], [() => { throw new DOMException("Synthetic timeout", "TimeoutError"); }, "uncertain"],
    [() => new Response("", { status: 500 }), "uncertain"], [() => new Response("", { status: 502 }), "uncertain"], [() => new Response("not json"), "uncertain"],
    [() => Response.json(null), "uncertain"], [() => Response.json({}), "uncertain"], [() => Response.json({ status: "processing" }), "uncertain"],
    [() => new Response("", { status: 400 }), "uncertain"], [() => new Response("", { status: 401 }), "uncertain"], [() => new Response("", { status: 429 }), "uncertain"],
    [() => Response.json({ status: "error" }), "uncertain"], [() => Response.json({ status: "failed" }), "uncertain"],
  ]) {
    let calls = 0;
    const { messaging } = fixture({ fetch: async () => { calls++; return respond(); } });
    await assert.rejects(() => messaging.sendSms({ phone, message: text }), (error) => {
      assert.ok(error instanceof YoolaMessagingError);
      assert.equal(error.code, "delivery"); assert.equal(error.dispatch, dispatch); assert.equal(error.cause, undefined);
      return true;
    });
    assert.equal(calls, 1);
  }
  for (const [credentials, code] of [[{}, "configuration"], [{ YOOLA_SMS_API_KEY: apiKey, YOOLA_SMS_SENDER: "Goal Hint" }, "configuration"]]) {
    const { messaging, requests } = fixture({ env: credentials });
    await assert.rejects(() => messaging.sendSms({ phone, message: text }), (error) => error.code === code && error.dispatch === "not-sent");
    assert.deepEqual(requests, []);
  }
  await assert.rejects(() => fixture().messaging.sendSms({ phone: "257700000001", message: text }), (error) => error.code === "unsupported-country" && error.dispatch === "not-sent");
});

test("configured() mirrors the delivery configuration rule without a request", () => {
  for (const [env, configured] of [[{ YOOLA_SMS_API_KEY: apiKey }, true], [{ YOOLA_SMS_API_KEY: ` ${apiKey} `, YOOLA_SMS_SENDER: "GoalHint" }, true], [{}, false],
    [{ YOOLA_SMS_API_KEY: " " }, false], [{ YOOLA_SMS_API_KEY: apiKey, YOOLA_SMS_SENDER: "Goal Hint" }, false]]) {
    const { messaging, requests } = fixture({ env });
    assert.equal(messaging.configured(), configured, JSON.stringify(Object.keys(env)));
    assert.deepEqual(requests, []);
  }
});
