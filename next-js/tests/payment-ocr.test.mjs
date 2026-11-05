import assert from "node:assert/strict";
import test from "node:test";
import { needsPaymentOcrEnhancement, paymentOcrResult, selectPaymentOcrResult } from "../src/domain/payment-ocr-result.ts";
import { enhancePaymentOcrPixels, paymentOcrDimensions } from "../src/components/members/payment-ocr-image.ts";

const complete = "MTN Mobile Money. Paid UGX 5,000. Transaction ID: TEST123456";
const page = (text, overrides = {}, confidence = 95) => ({ text, confidence,
  words: text.split(/\s+/u).filter(Boolean).map(text => ({ text, confidence: overrides[text] ?? 95 })) });

test("critical scores come from actual words instead of the page average", () => {
  const result = paymentOcrResult(page(complete, { "TEST123456": 37, "5,000.": 86 }, 98));
  assert.equal(result.confidence, 98);
  assert.deepEqual(result.fieldConfidence, { transactionId: 37, amountUgx: 86 });
  assert.deepEqual(result.uncertainFields, ["transactionId"]);
  assert.equal(needsPaymentOcrEnhancement(result), true);
  const unknown = paymentOcrResult({ text: complete, confidence: 98, words: [] });
  assert.deepEqual(unknown.fieldConfidence, { transactionId: null, amountUgx: null });
  assert.equal(needsPaymentOcrEnhancement(unknown), true);
});

test("field scores preserve grouped amounts and take the weakest matching token", () => {
  const result = paymentOcrResult(page("Paid UGX 5 000. Transaction ID: TEST-123456", { "000.": 72, "TEST-123456": 91 }));
  assert.deepEqual(result.fieldConfidence, { transactionId: 91, amountUgx: 72 });
  const repeated = paymentOcrResult(page(`${complete}\nBalance UGX 5,000`, { "5,000": 32 }));
  assert.equal(repeated.fieldConfidence.amountUgx, 32, "An ambiguous repeated number cannot borrow the stronger confidence");
  const missingWords = paymentOcrResult({ ...page(complete), words: [{ text: "9999999999", confidence: 99 }] });
  assert.deepEqual(missingWords.fieldConfidence, { transactionId: null, amountUgx: null });
});

test("blank and partial readings retain text and unknown scores without fabricating fields", () => {
  const blank = paymentOcrResult({ text: "", confidence: 0, words: [] });
  assert.equal(blank.text, ""); assert.equal(blank.confidence, 0);
  assert.deepEqual(blank.uncertainFields, ["transactionId", "amountUgx"]);
  const partial = paymentOcrResult(page("Transaction ID: TEST123456"));
  assert.equal(partial.fieldConfidence.transactionId, 95); assert.equal(partial.fieldConfidence.amountUgx, null);
  assert.deepEqual(partial.uncertainFields, ["amountUgx"]);
  assert.equal(paymentOcrResult(page(complete, {}, Number.NaN)).confidence, null);
  assert.equal(paymentOcrResult(page(complete, { TEST123456: -1 })).fieldConfidence.transactionId, null);
});

test("whole-reading selection improves completeness without assembling a fictional receipt", () => {
  const partial = paymentOcrResult(page("Transaction ID: TEST123456"));
  const better = paymentOcrResult(page(complete), true);
  const result = selectPaymentOcrResult([partial, better]);
  assert.equal(result.text, complete); assert.equal(result.attempts, 2); assert.equal(result.enhanced, true);
  assert.equal(needsPaymentOcrEnhancement(result), false);
  const amountOnly = paymentOcrResult(page("Paid UGX 5,000"), true);
  const complementary = selectPaymentOcrResult([partial, amountOnly]);
  assert.ok([partial.text, amountOnly.text].includes(complementary.text));
  assert.equal(Object.values(complementary.fieldConfidence).filter(value => value === null).length, 1);
  assert.throws(() => selectPaymentOcrResult([]), RangeError);
  assert.throws(() => selectPaymentOcrResult([better, better, better, better]), RangeError);
});

test("conflicting confident readings remain uncertain even if the selected page is strong", () => {
  const first = paymentOcrResult(page(complete));
  const conflict = paymentOcrResult(page(complete.replace("TEST123456", "TEST123458").replace("5,000", "6,000")), true);
  const result = selectPaymentOcrResult([first, conflict]);
  assert.equal(result.text, first.text, "Ties preserve the original reading");
  assert.deepEqual(result.uncertainFields, ["transactionId", "amountUgx"]);
  assert.equal(needsPaymentOcrEnhancement(result), true);
  assert.deepEqual(first.uncertainFields, [], "Selection does not mutate earlier results");
});

test("working images stay bounded and enlargement never exceeds two times", () => {
  assert.deepEqual(paymentOcrDimensions(600, 400, true), { width: 1200, height: 800 });
  for (const [width, height] of [[8000, 6000], [800, 12000], [12000, 800], [1, 1]]) {
    const result = paymentOcrDimensions(width, height, true);
    assert.ok(result.width <= 2600 && result.height <= 2600 && result.width * result.height <= 4_000_000);
    assert.ok(result.width <= width * 2 && result.height <= height * 2);
  }
  for (const size of [0, -1, Infinity, Number.NaN]) assert.throws(() => paymentOcrDimensions(size, 200));
});

const pixels = (width, height, valueAt) => {
  const result = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const p = (y * width + x) * 4, value = valueAt(x, y);
    result[p] = value; result[p + 1] = value; result[p + 2] = value; result[p + 3] = 255;
  }
  return result;
};

test("enhancement raises faint stroke contrast, removes isolated noise and preserves the source", async () => {
  const source = pixels(64, 64, (x, y) => x === 50 && y === 50 ? 0 : x >= 20 && x < 26 && y >= 12 && y < 52 ? 170 : 230);
  const original = source.slice(), output = await enhancePaymentOcrPixels(source, 64, 64, "contrast");
  const at = (image, x, y) => image[(y * 64 + x) * 4];
  assert.ok(at(output, 40, 30) - at(output, 23, 30) > at(source, 40, 30) - at(source, 23, 30));
  assert.equal(at(output, 50, 50), at(output, 51, 50));
  assert.deepEqual(source, original);
});

test("local threshold keeps text under uneven lighting and never invents text on a flat image", async () => {
  const source = pixels(128, 64, (x, y) => {
    const background = 150 + x * 0.7;
    return ((x >= 20 && x < 26) || (x >= 95 && x < 101)) && y >= 12 && y < 52 ? background - 50 : background;
  });
  const output = await enhancePaymentOcrPixels(source, 128, 64, "threshold");
  for (const x of [23, 98]) assert.equal(output[(32 * 128 + x) * 4], 0);
  for (const x of [40, 70]) assert.equal(output[(32 * 128 + x) * 4], 255);
  for (const value of [0, 128, 255]) {
    const blank = await enhancePaymentOcrPixels(pixels(32, 32, () => value), 32, 32, "threshold");
    assert.ok(blank.every(value => value === 255));
  }
});

test("processing yields and cancellation stops before another recognition can begin", async () => {
  const controller = new AbortController();
  const pending = enhancePaymentOcrPixels(pixels(256, 256, () => 200), 256, 256, "threshold", controller.signal);
  setTimeout(() => controller.abort(), 0);
  await assert.rejects(pending, { name: "AbortError" });
  await assert.rejects(enhancePaymentOcrPixels(new Uint8ClampedArray(4), 20, 20, "contrast"), RangeError);
});
