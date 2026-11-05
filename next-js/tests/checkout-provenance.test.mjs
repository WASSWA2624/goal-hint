import assert from "node:assert/strict";
import test from "node:test";
import { receiptInputSchema } from "../src/domain/checkout.ts";
import { checkoutDetailsIssue, checkoutEvidenceWarnings, paymentEvidenceSourceIssue, paymentMessageSource } from "../src/domain/checkout-evidence.ts";

const numbers = { mtn: "256700000901", airtel: "256700000902" };
const raw = "Paid UGX 5,000. Transaction ID: TEST123456";
const input = { text: raw, screenshotText: raw, hasImage: true, screenshotReady: true,
  transactionId: "TEST123456", amountUgx: "5000", payerPhone: "256700000123", messageSource: "image" };

test("image text remains one source even when edits add provider branding", () => {
  const warnings = checkoutEvidenceWarnings(input, "mtn", numbers);
  assert.deepEqual(warnings.map(warning => warning.id), ["screenshot.unknown-provider"]);
  const edited = { ...input, text: `MTN Mobile Money. ${raw}` };
  assert.deepEqual(checkoutEvidenceWarnings(edited, "mtn", numbers).map(warning => warning.id), ["screenshot.unknown-provider"],
    "A transcript edited to add branding cannot corroborate its own image");
  assert.deepEqual(checkoutEvidenceWarnings({ ...edited, messageSource: "message" }, "mtn", numbers), [],
    "A separately supplied matching message remains independent evidence");
  assert.deepEqual(checkoutEvidenceWarnings({ ...edited, messageSource: undefined }, "mtn", numbers), [],
    "Older clients retain the existing separate-message semantics");
});

test("image transcript corrections retain raw OCR discrepancies for review", () => {
  const original = `MTN. ${raw}`;
  const corrected = "Airtel. Paid UGX 6,000 to 0700000902. Transaction ID: OTHER123456";
  const warnings = checkoutEvidenceWarnings({ ...input, screenshotText: original, text: corrected,
    transactionId: "OTHER123456", amountUgx: "6000" }, "mtn", numbers);
  const ids = warnings.map(warning => warning.id);
  for (const id of ["transcript.method", "screenshot.reported-id", "screenshot.reported-amount", "sources.id", "sources.amount", "sources.provider"]) assert.ok(ids.includes(id), id);
  assert.match(warnings.find(warning => warning.id === "sources.id").message, /edited image text.*Check your edits against the image/u);
  assert.equal(input.screenshotText, raw, "Comparisons do not rewrite the retained OCR text");
});

test("image-derived text cannot outlive its image or original OCR", () => {
  assert.equal(checkoutDetailsIssue(input), null);
  const detached = { ...input, hasImage: false, screenshotReady: false };
  assert.match(checkoutDetailsIssue(detached), /Reattach the image or paste the original transaction message/u);
  assert.deepEqual(checkoutEvidenceWarnings(detached, "mtn", numbers).map(warning => warning.id), ["evidence.source"]);
  assert.match(paymentEvidenceSourceIssue({ ...input, screenshotText: " " }), /original extracted text is missing/u);
  assert.equal(checkoutDetailsIssue({ ...detached, messageSource: "message" }), null);
});

test("malformed message provenance is rejected instead of becoming independent evidence", () => {
  const proof = { transactionId: "TEST123456", amountUgx: 5000, payerPhone: "256700000123", paidAt: "2026-11-01T09:00:00Z",
    original: { text: raw, extracted: { screenshotText: raw, messageSource: "image" } } };
  assert.equal(receiptInputSchema.safeParse(proof).success, true);
  for (const source of [null, "", "IMAGE", "unknown", 0, true, {}]) {
    assert.equal(paymentMessageSource({ messageSource: source }), "invalid");
    assert.match(checkoutDetailsIssue({ ...input, messageSource: source }), /message source/u);
    assert.equal(receiptInputSchema.safeParse({ ...proof, original: { ...proof.original, extracted: { messageSource: source } } }).success, false);
  }
  assert.equal(paymentMessageSource({}), "message");
  assert.equal(paymentMessageSource({ messageSource: "message" }), "message");
  assert.equal(paymentMessageSource({ messageSource: "image" }), "image");
});

test("receipt inputs bound retained OCR text without silently truncating evidence", () => {
  const proof = { transactionId: "TEST123456", amountUgx: 5000, payerPhone: "256700000123", paidAt: "2026-11-01T09:00:00Z" };
  const atLimit = raw.padEnd(12_000, " ");
  for (const messageSource of ["image", "message", undefined]) {
    const extracted = messageSource ? { messageSource } : {};
    const parse = screenshotText => receiptInputSchema.safeParse({ ...proof, original: { text: raw, extracted: { ...extracted, screenshotText } } });
    assert.equal(parse(atLimit).data.original.extracted.screenshotText, atLimit);
    for (const screenshotText of [`${atLimit} `, 123, null]) assert.equal(parse(screenshotText).success, false);
    assert.equal(receiptInputSchema.safeParse({ ...proof, original: { text: raw, extracted } }).success, true);
  }
});
