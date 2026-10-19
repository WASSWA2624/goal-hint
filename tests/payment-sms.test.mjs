import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parsePaymentSms } from "../src/domain/payment-sms.ts";

const fixtures = JSON.parse(await readFile(new URL("fixtures/payment-sms/synthetic.json", import.meta.url), "utf8"));
for (const sample of fixtures.samples) test(`synthetic SMS: ${sample.label}`, () => assert.deepEqual(parsePaymentSms(sample.text, fixtures.ownerNumbers), sample.expected));
test("garbage and fee/balance-only messages supply no amount or ID", () => {
  for (const text of ["", "some unrelated words", "Fee UGX 500. Balance UGX 12,000", "Sent successfully. Fee UGX 500. Balance UGX 12,000", "x".repeat(12_001)]) assert.deepEqual(parsePaymentSms(text, {}), {});
});
test("the owner's recipient selects its network, while a foreign recipient warns without preventing edits", () => {
  assert.equal(parsePaymentSms("MTN: Paid UGX 5,000 to 0700000902", fixtures.ownerNumbers).network, "airtel");
  assert.deepEqual(parsePaymentSms("Paid UGX 5,000 to 0700000999", fixtures.ownerNumbers), { amount: 5000, counterparty: "256700000999", foreignRecipient: "256700000999" });
});
