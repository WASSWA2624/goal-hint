import assert from "node:assert/strict";
import test from "node:test";
import { parseRuntimePolicy } from "../src/server/config/runtime-policy.ts";
import { createFlutterwave, flutterwaveCheckoutUrl, flutterwaveOrigin, getFlutterwaveConfig } from "../src/server/members/flutterwave.ts";
import { createFlutterwaveHandlers } from "../src/server/members/flutterwave-http.ts";

const reference = "f4cf1d24-9d7d-46ee-bae2-40b1b782b492";
const key = "FLWSECK_TEST-fixture";
const webhookSecret = "fixture-hash";
const host = "https://test.goalhint.com";
const link = "https://checkout-v2.dev-flutterwave.com/v3/hosted/pay/flwlnk-fixture";
const paidAt = "2026-11-13T12:00:00Z";
const policy = (env) => parseRuntimePolicy({
  GOAL_HINT_FLUTTERWAVE_SECRET_KEY: key, GOAL_HINT_FLUTTERWAVE_WEBHOOK_SECRET: webhookSecret, ...env,
});

test("checkout links accept the provider's exact origins and hosted path", () => {
  assert.equal(flutterwaveCheckoutUrl(link), link);
  const documentedLink = link.replace("checkout-v2.dev-flutterwave.com", "checkout.flutterwave.com");
  assert.equal(flutterwaveCheckoutUrl(documentedLink), documentedLink);
  assert.equal(flutterwaveCheckoutUrl(link.replace(".com/", ".com.example.org/")), null);
  assert.equal(flutterwaveCheckoutUrl(link.replace("https:", "http:")), null);
  assert.equal(flutterwaveCheckoutUrl(link.replace("/v3/hosted/pay/", "/other/")), null);
  assert.equal(flutterwaveCheckoutUrl(`${link}?redirect=elsewhere`), null);
});

test("only local development and explicitly isolated staging can use a Flutterwave test key", () => {
  assert.equal(flutterwaveOrigin(getFlutterwaveConfig(policy()), "http://127.0.0.1:3000/en/subscribe"), "http://127.0.0.1:3000");
  assert.equal(flutterwaveOrigin(getFlutterwaveConfig(policy()), "https://untrusted.example/en/subscribe"), null);
  assert.equal(getFlutterwaveConfig(policy({ NODE_ENV: "production" })), null);
  assert.equal(getFlutterwaveConfig(policy({ GOAL_HINT_DEPLOYMENT_ENVIRONMENT: "production" })), null);
  assert.equal(getFlutterwaveConfig(policy({ GOAL_HINT_FLUTTERWAVE_SECRET_KEY: "FLWSECK-live" })), null);
  assert.equal(getFlutterwaveConfig(policy({ GOAL_HINT_FLUTTERWAVE_WEBHOOK_SECRET: undefined })), null);
  assert.equal(getFlutterwaveConfig(policy({ GOAL_HINT_FLUTTERWAVE_WEBHOOK_URL: "https://untrusted.example/webhook" })), null);
  assert.equal(flutterwaveOrigin(getFlutterwaveConfig(policy({
    NODE_ENV: "production", GOAL_HINT_DEPLOYMENT_ENVIRONMENT: "staging",
  })), "http://untrusted.example/"), host);
});

test("Standard checkout fixes the API origin and currency, then verifies by transaction ID", async () => {
  const requests = [];
  const flutterwave = createFlutterwave({ key, webhookSecret, origin: host }, async (url, options) => {
    requests.push([url, options]);
    if (options.method === "POST") return Response.json({ status: "success", data: { link } });
    return Response.json({ status: "success", data: { id: 123, tx_ref: reference, status: "successful",
      amount: 6000, currency: "UGX", created_at: paidAt } });
  });
  assert.equal(await flutterwave.start({ id: reference, amountUgx: 6000, payerPhone: "256772000001",
    email: "synthetic@example.test", origin: host, resumePlan: true }), link);
  const [url, options] = requests[0];
  assert.equal(url, "https://api.flutterwave.com/v3/payments");
  assert.equal(options.redirect, "error");
  assert.equal(options.headers.Authorization, `Bearer ${key}`);
  const payload = JSON.parse(options.body);
  assert.equal(payload.redirect_url, `${host}/api/payments/flutterwave/return?resume=plan`);
  assert.equal(payload.currency, "UGX");
  assert.equal(payload.amount, 6000);
  assert.equal(payload.tx_ref, reference);
  assert.deepEqual(await flutterwave.verify("123"), { id: "123", txRef: reference, amountUgx: 6000, currency: "UGX",
    status: "successful", paidAt: new Date(paidAt) });
  assert.equal(requests[1][0], "https://api.flutterwave.com/v3/transactions/123/verify");
  await assert.rejects(flutterwave.verify("124"));
});

test("webhook authenticates, verifies independently and ignores failed, pending and duplicate deliveries", async () => {
  let checks = 0, settlements = 0;
  let status = "pending", amountUgx = 6000, approved = false, failedVerification = false;
  const flutterwave = { config: { webhookSecret }, async verify(id) {
    checks++;
    if (failedVerification) throw new Error("Fixture timeout");
    return { id, txRef: reference, amountUgx, currency: "UGX", status, paidAt: new Date(paidAt) };
  } };
  const checkout = {
    async lookupFlutterwave(id) { return id === reference ? { amountUgx: 6000, status: approved ? "approved" : "provider-pending",
      transactionId: approved ? "123" : null } : null; },
    async settleFlutterwave(payment) {
      if (approved && payment.id !== "123") return { ok: false, code: "flutterwave-conflict" };
      settlements++; approved = true; return { ok: true };
    },
  };
  const { POST } = createFlutterwaveHandlers(async () => ({ flutterwave, checkout }));
  const send = (secret = webhookSecret, id = 123) => POST(new Request(`${host}/api/payments/flutterwave/webhook`, {
    method: "POST", headers: { "verif-hash": secret }, body: JSON.stringify({
      event: "charge.completed", data: { id, tx_ref: reference, amount: 6000, currency: "UGX", status: "successful" },
    }),
  }));
  assert.equal((await send("wrong")).status, 401);
  assert.equal(checks, 0);
  assert.equal((await send()).status, 503);
  status = "failed";
  assert.equal((await send()).status, 200);
  status = "successful"; amountUgx = 5000;
  assert.equal((await send()).status, 200);
  assert.equal(settlements, 0);
  failedVerification = true;
  assert.equal((await send()).status, 503);
  failedVerification = false; amountUgx = 6000;
  assert.equal((await send()).status, 200);
  assert.equal((await send()).status, 200);
  assert.equal(checks, 5);
  assert.equal(settlements, 1);
  assert.equal((await send(webhookSecret, 124)).status, 503);
  assert.equal(checks, 6);
  assert.equal(settlements, 1);
});

test("browser return verifies the active account and preserves the top-up journey", async () => {
  let accountId = "other", checks = 0, status = "pending";
  const { GET } = createFlutterwaveHandlers(async () => ({
    config: { production: true },
    sessions: { async verify() { return { accountId }; } },
    checkout: {
      async lookupFlutterwave() { return { accountId: "owner", amountUgx: 6000, purpose: "topup", status: "provider-pending" }; },
      async settleFlutterwave() { return { ok: true }; },
    },
    flutterwave: { async verify() { checks++; return { txRef: reference, status, amountUgx: 6000, currency: "UGX" }; } },
  }));
  const send = () => GET(new Request(`${host}/api/payments/flutterwave/return?resume=plan&tx_ref=${reference}&transaction_id=123&status=successful`));
  assert.equal((await send()).headers.get("Location"), "/en/account?section=subscription");
  assert.equal(checks, 0);
  accountId = "owner";
  assert.equal((await send()).headers.get("Location"), "/en/subscribe?add=credit&resume=plan&flutterwave=pending");
  status = "failed";
  assert.equal((await send()).headers.get("Location"), "/en/subscribe?add=credit&resume=plan&flutterwave=failed");
  status = "successful";
  assert.equal((await send()).headers.get("Location"), "/en/subscribe?add=credit&resume=plan&flutterwave=approved");
});
