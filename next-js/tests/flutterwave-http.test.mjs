import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { createFlutterwaveReturnHandler, createFlutterwaveWebhookHandler } from "../src/server/members/flutterwave-http.ts";
import { flutterwaveCheckoutOrigin, flutterwaveReturnUrl } from "../src/server/members/flutterwave-navigation.ts";
import { createFlutterwaveClient } from "../src/server/members/flutterwave.ts";

const reference = "b0e33c9a-8032-4770-9cdc-53b7d0b82fa2";
const production = "https://goalhint.com", staging = "https://test.goalhint.com";
const url = `${staging}/api/payments/flutterwave/webhook`;
const testKey = "synthetic-key-for-transport-tests", secret = "synthetic-webhook-config";
const key = (purpose, value) => createHmac("sha256", "synthetic-return-key").update(`${purpose}\0${value}`).digest("hex");
const successful = { id: 12345, tx_ref: reference, amount: 5000, currency: "UGX", status: "successful", created_at: "2026-11-22T06:07:00Z" };
const hostedLink = "https://checkout.flutterwave.com/v3/hosted/pay/test-link";

test("Flutterwave v3 checkout stays server-side and authenticates only the pinned API", async () => {
  const observed = [];
  const client = createFlutterwaveClient(testKey, async (address, init) => {
    observed.push([address.href, init]);
    return Response.json({ status: "success", data: init.method === "POST" ? { link: hostedLink } : successful });
  });
  const redirectUrl = flutterwaveReturnUrl(staging, reference, "/en/slips", key);
  assert.equal(await client.create({ reference, amountUgx: 5000, email: "sandbox@example.com", phone: "256700000101", redirectUrl }), hostedLink);
  const [createUrl, createRequest] = observed[0];
  assert.equal(createUrl, "https://api.flutterwave.com/v3/payments");
  assert.equal(createRequest.redirect, "error");
  assert.equal(createRequest.headers.Authorization, `Bearer ${testKey}`);
  assert.deepEqual(JSON.parse(createRequest.body), {
    tx_ref: reference, amount: 5000, currency: "UGX", redirect_url: redirectUrl, payment_options: "mobilemoneyuganda", session_duration: 30,
    customer: { email: "sandbox@example.com", phone_number: "+256700000101" }, customizations: { title: "Goal Hint subscription" },
  });
  assert.deepEqual(await client.verify(reference, "12345"), {
    id: "12345", reference, status: "successful", amountUgx: 5000, currency: "UGX", paidAt: new Date(successful.created_at),
  });
  assert.equal(observed[1][0], "https://api.flutterwave.com/v3/transactions/12345/verify");
  await client.verify(reference);
  assert.equal(observed[2][0], `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${reference}`);
  assert.equal(await client.verify(reference, "../balances"), null);
  assert.equal(observed.length, 3);
});

test("provider failures and unexpected hosted domains reveal no credentials or provider details", async () => {
  const invalid = createFlutterwaveClient(testKey, async () => Response.json({ status: "success", data: { link: `${hostedLink}@example.com` } }));
  await assert.rejects(invalid.create({ reference, amountUgx: 5000, phone: "256700000101", email: "sandbox@example.com", redirectUrl: staging }),
    { message: "Flutterwave checkout is temporarily unavailable." });
  const error = createFlutterwaveClient(testKey, async () => { throw new Error(`Error containing ${testKey}`); });
  await assert.rejects(error.verify(reference), { message: "Flutterwave is temporarily unavailable." });
  assert.equal(await createFlutterwaveClient(testKey, async () => new Response(null, { status: 404 })).verify(reference), null);
});

test("a v3 webhook authenticates the environment hash and acknowledges events only after reconciliation", async () => {
  let attempts = 0;
  const services = async () => ({ checkout: { async reconcileFlutterwave(ref, transaction) {
    assert.equal(ref, reference); assert.equal(transaction, "12345");
    if (++attempts === 2) throw new Error("temporary provider refusal");
    return { requestId: ref, status: "approved" };
  } } });
  const configuration = () => ({ webhookSecret: { read: () => secret }, webhookUrl: { read: () => url } });
  const webhook = createFlutterwaveWebhookHandler({ services, configuration });
  const payload = { event: "charge.completed", data: successful };
  const request = (signature, body = payload, host = "test.goalhint.com") => new Request(`http://127.0.0.1:3012${new URL(url).pathname}`, {
    method: "POST", headers: { Host: host, ...(signature ? { "verif-hash": signature } : {}) }, body: JSON.stringify(body),
  });
  assert.equal((await webhook(request())).status, 401);
  assert.equal((await webhook(request("wrong"))).status, 401);
  assert.equal((await webhook(request(secret, payload, "goalhint.com"))).status, 403);
  assert.equal((await webhook(request(secret, { event: "charge.completed", data: {} }))).status, 400);
  assert.equal((await webhook(request(secret, { event: "transfer.completed" }))).status, 200);
  assert.equal(attempts, 0);
  const acknowledged = await webhook(request(secret));
  assert.equal(acknowledged.status, 200);
  assert.equal(acknowledged.headers.get("cache-control"), "no-store");
  assert.equal((await webhook(request(secret))).status, 503);
  assert.equal((await createFlutterwaveWebhookHandler({ services, configuration: () => ({ webhookSecret: null, webhookUrl: null }) })(request(secret))).status, 503);
});

test("the signed browser return preserves the current attempt and destination without trusting query status", async () => {
  let calls = 0, approved = false;
  const handle = createFlutterwaveReturnHandler(async () => ({ config: { key }, checkout: { async reconcileFlutterwave(ref, id) {
    assert.equal(ref, reference); assert.equal(id, "12345"); calls++;
    return { requestId: ref, status: approved ? "approved" : "provider-pending" };
  } } }));
  const callback = new URL(flutterwaveReturnUrl(staging, reference, "/en/slips", key));
  callback.searchParams.set("tx_ref", reference);
  callback.searchParams.set("transaction_id", "12345");
  callback.searchParams.set("status", "cancelled");
  const forged = new URL(callback);
  forged.searchParams.set("return", "//another-site.example");
  assert.equal((await handle(new Request(forged), reference)).status, 403);
  forged.searchParams.set("tx_ref", "wrong-reference");
  assert.equal((await handle(new Request(forged), reference)).status, 400);
  assert.equal(calls, 0);
  const response = await handle(new Request(callback), reference);
  assert.equal(response.status, 303);
  const next = new URL(response.headers.get("location"), staging);
  assert.equal(next.pathname, "/en/subscribe");
  assert.deepEqual(Object.fromEntries(next.searchParams), { return: "/en/slips", checkout: "1", payment: reference, paymentStatus: "cancelled" });
  approved = true;
  const settled = await handle(new Request(callback), reference);
  assert.equal(new URL(settled.headers.get("location"), staging).searchParams.has("paymentStatus"), false);
});

test("live, hosted sandbox and local sandbox checkout use only their own app origin", () => {
  const request = (host, origin) => new Request("http://localhost:3012/api/account/checkout", { headers: { Host: host, Origin: origin } });
  assert.equal(flutterwaveCheckoutOrigin(request("goalhint.com", production), "live", production), production);
  assert.equal(flutterwaveCheckoutOrigin(request("test.goalhint.com", staging), "live", production), null);
  assert.equal(flutterwaveCheckoutOrigin(request("goalhint.com", staging), "live", production), null);
  assert.equal(flutterwaveCheckoutOrigin(request("test.goalhint.com", staging), "sandbox", staging), staging);
  assert.equal(flutterwaveCheckoutOrigin(request("localhost:3012", "http://localhost:3012"), "sandbox", staging), null);
  assert.equal(flutterwaveCheckoutOrigin(request("localhost:3012", "http://localhost:3012"), "sandbox"), "http://localhost:3012");
  assert.equal(flutterwaveCheckoutOrigin(request("test.goalhint.com", staging), "sandbox"), null);
});
