import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parsePaymentSms, transactionIdFromText } from "../src/domain/payment-sms.ts";

const fixtures = JSON.parse(await readFile(new URL("fixtures/payment-sms/synthetic.json", import.meta.url), "utf8"));
for (const sample of fixtures.samples) test(`synthetic SMS: ${sample.label}`, () => assert.deepEqual(parsePaymentSms(sample.text, fixtures.ownerNumbers), sample.expected));
test("garbage and fee/balance-only messages supply no amount or ID", () => {
  for (const text of ["", "some unrelated words", "Fee UGX 500. Balance UGX 12,000", "Sent successfully. Fee UGX 500. Balance UGX 12,000", "x".repeat(12_001)]) assert.deepEqual(parsePaymentSms(text, {}), {});
});
test("the owner's recipient selects its network, while a foreign recipient warns without preventing edits", () => {
  assert.equal(parsePaymentSms("MTN: Paid UGX 5,000 to 0700000902", fixtures.ownerNumbers).network, "airtel");
  assert.deepEqual(parsePaymentSms("Paid UGX 5,000 to 0700000999", fixtures.ownerNumbers), { amount: 5000, counterparty: "256700000999", foreignRecipient: "256700000999" });
});
test("a pasted payment SMS or bare ID yields only the transaction ID; other text yields nothing", () => {
  for (const sample of fixtures.samples) assert.equal(transactionIdFromText(sample.text), sample.expected.transactionId, sample.label);
  for (const [text, id] of [["TEST-MTN-001", "TESTMTN001"], ["  12345678901 \n", "12345678901"], ["1234 5678 901", "12345678901"], ["ID: 98765432101", "98765432101"],
    ["MTN: You have sent UGX 5,000 to TEST PAYEE. Fee UGX 0. ID: 98765432101.", "98765432101"], ["Txn ID 55554444", "55554444"]]) {
    assert.equal(transactionIdFromText(text), id, text);
  }
  for (const text of ["", "abc", "Hello, how are you?", "Fee UGX 500. Balance UGX 12,000", "x".repeat(61), "ID_1234_5678"]) assert.equal(transactionIdFromText(text), null, text);
});
