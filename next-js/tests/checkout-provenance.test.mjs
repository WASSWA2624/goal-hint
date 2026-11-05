import assert from "node:assert/strict";
import test from "node:test";
import { receiptInputSchema } from "../src/domain/checkout.ts";
import { checkoutDetailsIssue, checkoutEvidenceWarnings, paymentEvidenceSourceIssue, paymentMessageSource } from "../src/domain/checkout-evidence.ts";
import { inspectPaymentScreenshot, parseScreenshotOcr, screenshotOcrNeedsReview, screenshotOcrUncertainFields } from "../src/domain/payment-screenshot.ts";

const numbers = { mtn: "256700000901", airtel: "256700000902" };
const raw = "Paid UGX 5,000. Transaction ID: TEST123456";
const input = { text: raw, screenshotText: raw, hasImage: true, screenshotReady: true,
  transactionId: "TEST123456", amountUgx: "5000", payerPhone: "256700000123", messageSource: "image" };
const quality = { confidence: 95, fieldConfidence: { transactionId: 94, amountUgx: 96 }, uncertainFields: [], attempts: 1, enhanced: false };
const withQuality = (patch = {}) => JSON.stringify({ ...quality, ...patch });

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

test("completed OCR may retain partial or blank image evidence, but final details remain required", () => {
  for (const screenshotText of ["", "MTN Mobile Money", "Transaction ID: TEST123456", "Paid UGX 5,000"]) {
    assert.equal(inspectPaymentScreenshot(screenshotText).ok, false, "Legacy readers still require readable evidence");
    assert.equal(inspectPaymentScreenshot(screenshotText, quality).ok, true, "A completed read can be corrected manually");
    const partial = { ...input, text: `MTN. ${raw}`, screenshotText, screenshotOcr: withQuality() };
    assert.equal(checkoutDetailsIssue(partial), null);
    for (const patch of [{ transactionId: "" }, { amountUgx: "0" }, { amountUgx: "5000.5" }, { payerPhone: "" }])
      assert.match(checkoutDetailsIssue({ ...partial, ...patch }), /valid transaction ID/u);
    assert.equal(screenshotOcrNeedsReview(screenshotText, quality), true, "Claimed high confidence cannot hide missing raw fields");
    assert.ok(checkoutEvidenceWarnings(partial, "mtn", numbers).some(warning => warning.id.startsWith("screenshot.ocr-")));
  }
  assert.equal(inspectPaymentScreenshot(raw.padEnd(12_001, " "), quality).ok, false);
  assert.equal(inspectPaymentScreenshot(raw, { ...quality, attempts: 0 }).ok, false);
});

test("recognition metadata is strict, bounded and requires literal original OCR text", () => {
  assert.deepEqual(parseScreenshotOcr(withQuality()), quality);
  const proof = { transactionId: "TEST123456", amountUgx: 5000, payerPhone: "256700000123", paidAt: "2026-11-01T09:00:00Z",
    original: { text: `MTN. ${raw}`, extracted: { messageSource: "image", screenshotText: "", screenshotOcr: withQuality() } } };
  assert.equal(receiptInputSchema.safeParse(proof).success, true);
  const invalid = [null, 1, quality, "{", "null", "[]", " ".repeat(1025) + withQuality(),
    withQuality({ confidence: -1 }), withQuality({ confidence: 101 }), withQuality({ confidence: "95" }),
    withQuality({ attempts: 0 }), withQuality({ attempts: 4 }), withQuality({ attempts: 1.5 }), withQuality({ enhanced: 1 }),
    withQuality({ fieldConfidence: { transactionId: 90 } }), withQuality({ fieldConfidence: { transactionId: 90, amountUgx: 101 } }),
    withQuality({ fieldConfidence: { ...quality.fieldConfidence, verified: true } }), withQuality({ uncertainFields: ["payerPhone"] }),
    withQuality({ uncertainFields: ["transactionId", "transactionId"] }), withQuality({ verified: true })];
  for (const screenshotOcr of invalid) {
    assert.equal(parseScreenshotOcr(screenshotOcr), null);
    assert.equal(receiptInputSchema.safeParse({ ...proof, original: { ...proof.original,
      extracted: { ...proof.original.extracted, screenshotOcr } } }).success, false);
    assert.match(paymentEvidenceSourceIssue({ ...input, screenshotOcr }), /recognition details are invalid/u);
  }
  assert.equal(receiptInputSchema.safeParse({ ...proof, original: { ...proof.original,
    extracted: { messageSource: "image", screenshotOcr: withQuality() } } }).success, false, "Missing raw text differs from a completed blank read");
  for (const messageSource of ["image", "message"]) assert.match(checkoutDetailsIssue({ ...input, messageSource,
    screenshotOcr: withQuality(), hasImage: false, screenshotReady: false }), /Reattach the image/u);
});

test("low confidence and conflicting readings require review even after transcript or message corrections", () => {
  const complete = `MTN. ${raw}`;
  const recognized = { ...input, text: complete, screenshotText: complete, screenshotOcr: withQuality() };
  assert.equal(screenshotOcrNeedsReview(complete, quality), false);
  assert.deepEqual(checkoutEvidenceWarnings(recognized, "mtn", numbers), []);
  const uncertain = { ...quality, fieldConfidence: { transactionId: 79, amountUgx: null } };
  assert.deepEqual(screenshotOcrUncertainFields(complete, uncertain), ["transactionId", "amountUgx"]);
  for (const messageSource of ["image", "message"]) {
    const warnings = checkoutEvidenceWarnings({ ...recognized, messageSource, screenshotOcr: JSON.stringify(uncertain) }, "mtn", numbers);
    assert.deepEqual(warnings.map(warning => warning.id), ["screenshot.ocr-transactionId", "screenshot.ocr-amountUgx"],
      "Edited or independently matching text cannot erase uncertainty in the image reading");
  }
  assert.deepEqual(screenshotOcrUncertainFields(complete, { ...quality, uncertainFields: ["amountUgx"] }), ["amountUgx"],
    "High-confidence conflicting OCR attempts still require review");
  for (const confidence of [null, 79]) {
    const warnings = checkoutEvidenceWarnings({ ...recognized, screenshotOcr: withQuality({ confidence }) }, "mtn", numbers);
    assert.deepEqual(warnings.map(warning => warning.id), ["screenshot.ocr-confidence"]);
  }
  const edited = checkoutEvidenceWarnings({ ...recognized, text: complete.replace("5,000", "6,000"), amountUgx: "6000",
    screenshotOcr: withQuality({ uncertainFields: ["amountUgx"] }) }, "mtn", numbers).map(warning => warning.id);
  for (const id of ["screenshot.ocr-amountUgx", "screenshot.reported-amount", "sources.amount"]) assert.ok(edited.includes(id));
});
