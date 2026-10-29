import assert from "node:assert/strict";
import test from "node:test";
import { canOpenMoneyMenu, formatPaymentReference, normalizeTransactionId, parsePaymentFields, paymentRules, transactionKey } from "../src/domain/payment.ts";
import { imageInputFormat } from "../src/server/images/image-format.ts";
import { badgeInputFormat } from "../src/server/images/provider-badge.ts";
import { createPaymentHandler } from "../src/server/members/payment-http.ts";
import { createPayments } from "../src/server/members/payments.ts";
import { uploadPayment } from "../src/components/members/payment-image.ts";

import { jpeg, paymentRequest, values } from "./helpers/payment-fixtures.mjs";
const fixture = () => {
  const calls = { begin: 0, submit: [] }, services = { config: { production: false }, settings: { settings: { paywallMode: "test" } },
    sessions: { verify: async () => ({ accountId: "account", tokenHash: "hash", blocked: false }) }, payments: {
      begin: async () => { calls.begin++; return true; }, submit: async (...args) => { calls.submit.push(args); return { status: "saved", reference: "PTEST" }; } } };
  return { calls, services, handler: createPaymentHandler(async () => services, { deadlineMs: 30 }) };
};
test("payment fields normalize IDs and numbers, with exact limits and a strict whitelist", () => {
  assert.equal(parsePaymentFields(values).transactionId, "TX.1001"); assert.equal(parsePaymentFields(values).payerPhone, "256700000101");
  assert.equal(normalizeTransactionId(" tx-100 1 "), "TX1001");
  assert.equal(transactionKey("tx .100-1"), transactionKey("TX1001"));
  assert.deepEqual(parsePaymentFields({ planId: values.planId, payerPhone: "+256 700 000 102", network: "airtel", transactionId: "TX-1234", accepted: "true" }), {
    purpose: "plan", planId: values.planId, network: "airtel", accepted: true, payerPhone: "256700000102", transactionId: "TX1234", screenshotAmount: null,
  });
  // The amount read from the screenshot is a bounded whole number of shillings, or empty when none was read.
  assert.equal(parsePaymentFields(values).screenshotAmount, 5000);
  for (const screenshotAmount of [undefined, ""]) assert.equal(parsePaymentFields({ ...values, screenshotAmount }).screenshotAmount, null);
  for (const screenshotAmount of ["99", "10000001", "5e3", "5,000", "-5000", "05000", "abc"]) assert.equal(parsePaymentFields({ ...values, screenshotAmount }), null, screenshotAmount);
  for (const payerPhone of [undefined, null, "", "   ", "256", "0201234567", 256700000101]) assert.equal(parsePaymentFields({ ...values, payerPhone }), null);
  for (const fields of [{ amount: "99" }, { amount: "10000001" }, { amount: "5e3" }, { transactionId: undefined }, { transactionId: null }, { transactionId: "" }, { transactionId: "   " }, { transactionId: "---." }, { transactionId: "abc" }, { transactionId: "<script>" }, { transactionId: "A".repeat(41) }, { payerPhone: "0201234567" }, { network: "other" }, { accepted: "yes" }, { sms: "secret" }]) assert.equal(parsePaymentFields({ ...values, ...fields }), null);
});

test("a top-up names its amount and no plan, and a plan report names no top-up amount", () => {
  const topUp = { ...values, purpose: "topup", planId: "", topUpAmount: "25000" };
  assert.deepEqual(parsePaymentFields(topUp), { purpose: "topup", topUpUgx: 25000, network: values.network, payerPhone: "256700000101",
    transactionId: "TX.1001", screenshotAmount: 5000, accepted: values.accepted === "true" });
  assert.equal(parsePaymentFields({ ...topUp, planId: undefined }).topUpUgx, 25000);
  for (const topUpAmount of ["999", "500001", "1000000", "1e4", "25,000", "-5000", "05000", "", undefined]) assert.equal(parsePaymentFields({ ...topUp, topUpAmount }), null, String(topUpAmount));
  for (const amount of ["1000", "500000"]) assert.equal(parsePaymentFields({ ...topUp, topUpAmount: amount }).topUpUgx, Number(amount));
  assert.equal(parsePaymentFields({ ...topUp, planId: values.planId }), null, "a top-up never names a plan");
  assert.equal(parsePaymentFields({ ...values, topUpAmount: "25000" }), null, "a plan report never names a top-up");
  assert.equal(parsePaymentFields({ ...values, purpose: "plan", topUpAmount: "" }).planId, values.planId);
  for (const purpose of ["credit", "", "PLAN"]) assert.equal(parsePaymentFields({ ...values, purpose }), null, purpose);
});

test("payment display references omit the separator and preserve their stored key", () => {
  assert.equal(formatPaymentReference("ABCD"), "PABCD");
  assert.equal(formatPaymentReference("PABC"), "PPABC");
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
  for (const options of [{ extra: true }, { duplicateFields: ["image"] }, { image: null, duplicateFields: ["transactionId"] }, { image: null, duplicateFields: ["payerPhone"] }, { image: Buffer.from("png bytes"), type: "image/jpeg" }, { image: jpeg(6000, 6000) }, { image: Buffer.alloc(0) }, { image: Buffer.alloc(3_000_001) }, { image: null, fields: { image: "not a file" } }]) assert.equal((await f.handler(await paymentRequest(options))).status, 400);
  assert.equal(f.calls.submit.length, 1);
  assert.equal((await f.handler(await paymentRequest({ headers: { "content-length": "3200001" } }))).status, 413);
  const missing = await paymentRequest(); missing.headers.delete("content-length"); assert.equal((await f.handler(missing)).status, 411);
  const chunked = new Request("http://localhost/api/account/payments", { method: "POST", headers: { "sec-fetch-site": "same-origin", "content-length": "1" }, duplex: "half", body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(3_200_001)); controller.close(); } }) });
  assert.equal((await f.handler(chunked)).status, 413);
  const slow = new Request("http://localhost/api/account/payments", { method: "POST", headers: { "sec-fetch-site": "same-origin", "content-length": "100" }, duplex: "half", body: new ReadableStream({ start() {} }) });
  assert.equal((await f.handler(slow)).status, 408); assert.equal(f.calls.submit.length, 1);
});

test("a report accepts an optional screenshot but requires a valid transaction ID and payer; amount overrides are refused", async () => {
  const f = fixture();
  assert.equal((await f.handler(await paymentRequest({ fields: { payerPhone: "0700000102" } }))).status, 201);
  assert.equal(f.calls.submit[0][1].payerPhone, "256700000102"); assert.equal(f.calls.submit[0][1].transactionId, "TX.1001");
  assert.equal(f.calls.submit[0][1].screenshotAmount, 5000); assert.ok(f.calls.submit[0][2]);
  assert.equal((await f.handler(await paymentRequest({ fields: { screenshotAmount: "" } }))).status, 201, "an unread amount");
  assert.equal(f.calls.submit[1][1].screenshotAmount, null);
  assert.equal((await f.handler(await paymentRequest({ image: null, fields: { screenshotAmount: "" } }))).status, 201, "no screenshot");
  assert.equal(f.calls.submit[2][2], null);
  assert.equal((await f.handler(await paymentRequest({ fields: { transactionId: "" } }))).status, 400, "no transaction ID");
  assert.equal((await f.handler(await paymentRequest({ fields: { screenshotAmount: undefined } }))).status, 400, "the amount field is always sent");
  for (const transactionId of [undefined, "   ", "---.", "<script>"]) {
    assert.equal((await f.handler(await paymentRequest({ fields: { transactionId } }))).status, 400);
    assert.equal((await f.handler(await paymentRequest({ image: null, fields: { transactionId } }))).status, 400);
  }
  for (const payerPhone of [undefined, null, "", "   ", "256", "0201234567"]) {
    assert.equal((await f.handler(await paymentRequest({ fields: { payerPhone } }))).status, 400);
    assert.equal((await f.handler(await paymentRequest({ image: null, fields: { payerPhone } }))).status, 400);
  }
  assert.equal((await f.handler(await paymentRequest({ fields: { amount: "100" } }))).status, 400);
  assert.equal((await f.handler(await paymentRequest({ image: null, fields: { amount: "100" } }))).status, 400);
  assert.equal(f.calls.submit.length, 3);
  f.services.sessions.verify = async () => null;
  const signedOut = await paymentRequest(); assert.equal((await f.handler(signedOut)).status, 403); assert.equal(signedOut.bodyUsed, false);
});

test("direct payment submissions cannot substitute the account phone for an absent or invalid payer", async () => {
  const payments = createPayments({ database: { async transaction() { assert.fail("Invalid payer data must not reach storage."); } },
    config: { key: () => "unused" }, environment: null });
  const member = { accountId: "account", tokenHash: "session", phone: "256700000101" };
  for (const payerPhone of [undefined, null, "", "   ", "256", "0201234567", 256700000101]) {
    assert.deepEqual(await payments.submit(member, { ...values, payerPhone, accepted: true }), { status: "invalid" });
  }
  // A malformed transaction ID never reaches storage, with or without an image.
  assert.deepEqual(await payments.submit(member, { ...values, transactionId: "<script>", accepted: true }, null), { status: "invalid" });
  assert.deepEqual(await payments.submit(member, { ...values, transactionId: "<script>", accepted: true }, jpeg()), { status: "invalid" });
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
        this.status = fail ? 503 : 201; this.responseText = fail ? JSON.stringify({ message: "Busy, try again later" }) : JSON.stringify({ reference: "PTEST" });
        this.onload();
      });
    }
  };
  const body = new FormData(); body.set("transactionId", "TEST-1234"); body.set("image", new File([jpeg()], "payment.jpg"));
  const progress = [];
  await assert.rejects(uploadPayment(body, (value) => progress.push(value)), /Busy/);
  assert.equal(body.get("transactionId"), "TEST-1234"); fail = false;
  assert.deepEqual(await uploadPayment(body, (value) => progress.push(value)), { reference: "PTEST" });
  assert.deepEqual(progress, [50, 50]); assert.ok(observed.filter((entry) => entry.timeout).every((entry) => entry.timeout === 90_000 && entry.body === body));
});

test("owner checks flag duplicate proof and payer differences without treating a screenshot as verification", async () => {
  const { paymentChecks } = await import("../src/domain/payment-checks.ts");
  const base = { received:5000,price:5000,transactionId:true,approved:null,pending:null,image:null,payerAccount:false,payerDiffers:false };
  assert.equal(paymentChecks(base).filter(c=>c.tone==="warning").length,0);
  const all = paymentChecks({...base,received:1000,approved:"PAAAA",pending:"PBBBB",image:"PCCCC",payerAccount:true,payerDiffers:true});
  assert.equal(all.filter(c=>c.tone==="warning").length,6);
  assert.deepEqual(all[0], { tone: "warning", text: "UGX 1,000 received is below the UGX 5,000 price", summary: "Received amount is below the package price" });
  assert.equal(paymentChecks({...base,payerDiffers:true})[5].tone,"info");
  for (const companion of [{image:"PCCCC"},{payerAccount:true}]) assert.equal(paymentChecks({...base,payerDiffers:true,...companion})[5].tone,"warning");
  const unverified = paymentChecks({ ...base, received: null, transactionId: false });
  assert.deepEqual(unverified[0], { tone: "info", text: "Check your wallet SMS shows UGX 5,000 received", summary: "Confirm the received transfer in your wallet SMS" });
  assert.match(unverified[1].text, /No transaction ID/);
  // The screenshot's amount is the last line: absent without a screenshot, a prompt when unread, a warning when short.
  assert.equal(paymentChecks(base).length, paymentChecks({ ...base, screenshotAmount: 5000 }).length - 1);
  assert.deepEqual(paymentChecks({ ...base, screenshotAmount: 5000 }).at(-1), { tone: "good", text: "Screenshot shows UGX 5,000", summary: "Screenshot amount covers the reported package price" });
  assert.deepEqual(paymentChecks({ ...base, screenshotAmount: 1000 }).at(-1), { tone: "warning", text: "Screenshot shows UGX 1,000, below the UGX 5,000 price", summary: "Screenshot amount is below the reported package price" });
  assert.equal(paymentChecks({ ...base, screenshotAmount: null }).at(-1).tone, "info");
  const excess = paymentChecks({ ...base, screenshotAmount: 6000 });
  assert.deepEqual(excess.at(-1), { tone: "info", text: "UGX 1,000 above the price becomes credit if you record UGX 6,000 received", summary: "Any confirmed excess becomes account credit" });
  assert.equal(excess.at(-2).tone, "good", "The screenshot hint remains before the conditional credit hint.");
  assert.equal(excess.at(-2).text, "Screenshot shows UGX 6,000");
  assert.ok(excess.filter(check => check.summary).every(check => !/\d/u.test(check.summary)), "Desktop summaries avoid repeating the payment figures.");
  const topUp = paymentChecks({ ...base, purpose: "topup", received: 1000, screenshotAmount: 1000 });
  assert.equal(topUp[0].summary, "Received amount is below the reported top-up");
  assert.equal(topUp.at(-2).summary, "Screenshot amount is below the reported top-up");
  assert.equal(paymentChecks({ ...base, purpose: "topup", screenshotAmount: 5000 }).at(-2).summary, "Screenshot amount covers the reported top-up");
});
