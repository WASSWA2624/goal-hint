import assert from "node:assert/strict";
import test from "node:test";
import { canOpenMoneyMenu, parsePaymentFields, paymentRules, transactionKey } from "../src/domain/payment.ts";
import { imageInputFormat } from "../src/server/images/image-format.ts";
import { badgeInputFormat } from "../src/server/images/provider-badge.ts";
import { createPaymentHandler } from "../src/server/members/payment-http.ts";
import { uploadPayment } from "../src/components/members/payment-image.ts";

import { jpeg, paymentRequest, values } from "./helpers/payment-fixtures.mjs";
const fixture = () => {
  const calls = { begin: 0, submit: [] }, services = { config: { production: false }, settings: { settings: { paywallMode: "test" } },
    sessions: { verify: async () => ({ accountId: "account", tokenHash: "hash", blocked: false }) }, payments: {
      begin: async () => { calls.begin++; return true; }, submit: async (...args) => { calls.submit.push(args); return { status: "saved", reference: "P-TEST" }; } } };
  return { calls, services, handler: createPaymentHandler(async () => services, { deadlineMs: 30 }) };
};
test("payment fields normalize IDs and numbers, with exact limits and a strict whitelist", () => {
  assert.equal(parsePaymentFields(values).transactionId, "TX.100-1"); assert.equal(parsePaymentFields(values).payerPhone, "256700000101");
  assert.equal(transactionKey("tx .100-1"), transactionKey("TX1001"));
  assert.deepEqual(parsePaymentFields({ planId: values.planId, network: "airtel", accepted: "true" }), {
    planId: values.planId, network: "airtel", accepted: true, payerPhone: null, transactionId: null,
  });
  for (const fields of [{ amount: "99" }, { amount: "10000001" }, { amount: "5e3" }, { transactionId: "---." }, { transactionId: "abc" }, { transactionId: "<script>" }, { payerPhone: "0201234567" }, { network: "other" }, { accepted: "yes" }, { sms: "secret" }]) assert.equal(parsePaymentFields({ ...values, ...fields }), null);
});
test("image policy trusts magic and bounded dimensions while preserving the provider badge policy", () => {
  const policy = { formats: ["jpeg"], maxBytes: paymentRules.imageBytes, minSide: 200, maxSide: 4096, maxPixels: 12_000_000 };
  assert.equal(imageInputFormat(jpeg(), policy), "jpeg");
  for (const input of [jpeg(199, 200), jpeg(4097, 200), jpeg(4096, 4096), Buffer.from("RIFF WebP"), Buffer.alloc(3_000_001), Buffer.from("not jpeg")]) assert.equal(imageInputFormat(input, policy), null);
  const png = Buffer.alloc(24); Buffer.from("89504e470d0a1a0a", "hex").copy(png); png.write("IHDR", 12); png.writeUInt32BE(2048, 16); png.writeUInt32BE(2048, 20);
  assert.equal(badgeInputFormat(png), "png"); assert.equal(imageInputFormat(png, policy), null); png.writeUInt32BE(2049, 16); assert.equal(badgeInputFormat(png), null);
  assert.equal(badgeInputFormat(jpeg(2048, 2048)), "jpeg"); assert.equal(badgeInputFormat(jpeg(2049, 100)), null); assert.equal(badgeInputFormat(Buffer.alloc(1_048_577)), null);
  for (let size = 0; size < 24; size++) assert.doesNotThrow(() => imageInputFormat(Buffer.from([255, 216, ...Array(size).fill(255), 192]), policy));
});
test("multipart reads are bounded and strict; extra SMS, spoofed content types and unsupported files never reach storage", async () => {
  const f = fixture(); assert.equal((await f.handler(await paymentRequest())).status, 201); assert.equal(f.calls.submit.length, 1);
  for (const options of [{ extra: true }, { image: Buffer.from("png bytes"), type: "image/jpeg" }, { image: jpeg(6000, 6000) }, { image: Buffer.alloc(3_000_001) }]) assert.equal((await f.handler(await paymentRequest(options))).status, 400);
  assert.equal(f.calls.submit.length, 1);
  assert.equal((await f.handler(await paymentRequest({ headers: { "content-length": "3200001" } }))).status, 413);
  const missing = await paymentRequest(); missing.headers.delete("content-length"); assert.equal((await f.handler(missing)).status, 411);
  const chunked = new Request("http://localhost/api/account/payments", { method: "POST", headers: { "sec-fetch-site": "same-origin", "content-length": "1" }, duplex: "half", body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(3_200_001)); controller.close(); } }) });
  assert.equal((await f.handler(chunked)).status, 413);
  const slow = new Request("http://localhost/api/account/payments", { method: "POST", headers: { "sec-fetch-site": "same-origin", "content-length": "100" }, duplex: "half", body: new ReadableStream({ start() {} }) });
  assert.equal((await f.handler(slow)).status, 408); assert.equal(f.calls.submit.length, 1);
});

test("proof can omit optional payment details while amount overrides and unauthenticated uploads are refused", async () => {
  const f = fixture();
  assert.equal((await f.handler(await paymentRequest({ fields: { payerPhone: "", transactionId: "" } }))).status, 201);
  assert.equal(f.calls.submit[0][1].payerPhone, null); assert.equal(f.calls.submit[0][1].transactionId, null);
  assert.equal((await f.handler(await paymentRequest({ fields: { amount: "100" } }))).status, 400);
  assert.equal(f.calls.submit.length, 1);
  f.services.sessions.verify = async () => null;
  const signedOut = await paymentRequest(); assert.equal((await f.handler(signedOut)).status, 403); assert.equal(signedOut.bodyUsed, false);
});
test("attempt checks precede the body, and only two uploads may be in flight", async () => {
  const f = fixture(); f.services.payments.begin = async () => false;
  const request = await paymentRequest(); assert.equal((await f.handler(request)).status, 429); assert.equal(request.bodyUsed, false);
  let release; const barrier = new Promise((resolve) => { release = resolve; }); f.services.payments.begin = async () => { await barrier; return true; };
  const a = f.handler(await paymentRequest()), b = f.handler(await paymentRequest());
  assert.equal((await f.handler(await paymentRequest())).status, 503); release(); assert.deepEqual((await Promise.all([a, b])).map((response) => response.status), [201, 201]);
});
test("money-menu links are Android browser only", () => {
  assert.equal(canOpenMoneyMenu("Mozilla Android Chrome"), true);
  for (const ua of ["iPhone Safari", "Android; wv) Chrome", "Android FBAN", "Android FBAV", "Android Instagram"]) assert.equal(canOpenMoneyMenu(ua), false);
});
test("browser upload reports progress, sets its deadline and preserves multipart values on retry", async (t) => {
  const previous = globalThis.XMLHttpRequest, observed = [];
  t.after(() => { if (previous === undefined) delete globalThis.XMLHttpRequest; else globalThis.XMLHttpRequest = previous; });
  let fail = true;
  globalThis.XMLHttpRequest = class {
    upload = {};
    open(method, path) { observed.push([method, path]); }
    setRequestHeader(name, value) { observed.push([name, value]); }
    send(body) {
      observed.push({ body, timeout: this.timeout });
      queueMicrotask(() => {
        this.upload.onprogress({ lengthComputable: true, loaded: 200, total: 400 });
        this.status = fail ? 503 : 201; this.responseText = fail ? JSON.stringify({ message: "Busy, try again later" }) : JSON.stringify({ reference: "P-TEST" });
        this.onload();
      });
    }
  };
  const body = new FormData(); body.set("transactionId", "TEST-1234"); body.set("image", new File([jpeg()], "payment.jpg"));
  const progress = [];
  await assert.rejects(uploadPayment(body, (value) => progress.push(value)), /Busy/);
  assert.equal(body.get("transactionId"), "TEST-1234"); fail = false;
  assert.deepEqual(await uploadPayment(body, (value) => progress.push(value)), { reference: "P-TEST" });
  assert.deepEqual(progress, [50, 50]); assert.ok(observed.filter((entry) => entry.timeout).every((entry) => entry.timeout === 90_000 && entry.body === body));
});

test("owner checks flag duplicate proof and payer differences without treating a screenshot as verification", async () => {
  const { paymentChecks } = await import("../src/domain/payment-checks.ts");
  const base = { received:5000,price:5000,transactionId:true,approved:null,pending:null,image:null,payerAccount:false,payerDiffers:false };
  assert.equal(paymentChecks(base).filter(c=>c.tone==="warning").length,0);
  const all = paymentChecks({...base,received:1000,approved:"P-AAAA",pending:"P-BBBB",image:"P-CCCC",payerAccount:true,payerDiffers:true});
  assert.equal(all.filter(c=>c.tone==="warning").length,6);
  assert.equal(paymentChecks({...base,payerDiffers:true})[5].tone,"info");
  for (const companion of [{image:"P-CCCC"},{payerAccount:true}]) assert.equal(paymentChecks({...base,payerDiffers:true,...companion})[5].tone,"warning");
  const unverified = paymentChecks({ ...base, received: null, transactionId: false });
  assert.match(unverified[0].text, /Check your wallet/);
  assert.match(unverified[1].text, /No transaction ID/);
});
