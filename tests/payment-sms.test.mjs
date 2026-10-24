import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parsePaymentSms, paymentEvidence } from "../src/domain/payment-sms.ts";

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
  for (const sample of fixtures.samples) assert.equal(paymentEvidence(sample.text).transactionId, sample.expected.transactionId, sample.label);
  for (const [text, id] of [["TEST-MTN-001", "TESTMTN001"], ["  12345678901 \n", "12345678901"], ["1234 5678 901", "12345678901"], ["ID: 98765432101", "98765432101"],
    ["MTN: You have sent UGX 5,000 to TEST PAYEE. Fee UGX 0. ID: 98765432101.", "98765432101"], ["Txn ID 55554444", "55554444"]]) {
    assert.equal(paymentEvidence(text).transactionId, id, text);
  }
  for (const text of ["", "abc", "Hello, how are you?", "Fee UGX 500. Balance UGX 12,000", "x".repeat(61), "ID_1234_5678"]) assert.equal(paymentEvidence(text).transactionId, null, text);
});
test("a pasted message or screenshot text also gives the amount and network, using the owner's numbers", () => {
  const owners = fixtures.ownerNumbers;
  assert.deepEqual(paymentEvidence("MTN MoMo: You have sent UGX 5,000 to TEST PAYEE 0700000901. Transaction ID: TEST-MTN-001.", owners),
    { transactionId: "TESTMTN001", amount: 5000, network: "mtn" });
  assert.deepEqual(paymentEvidence("Paid UGX 20,000 to 0700000902. TID: AIR.9", owners), { transactionId: "AIR.9", amount: 20000, network: "airtel" });
  assert.deepEqual(paymentEvidence("12345678901", owners), { transactionId: "12345678901", amount: null, network: null });
  assert.deepEqual(paymentEvidence("Thanks!", owners), { transactionId: null, amount: null, network: null });
});
test("a screenshot of a message thread gives the newest payment, and screenshot text is never a bare ID", () => {
  const thread = "You have sent UGX 1,000 to TEST PAYEE 0700000901. Transaction ID: 11112222333.\n"
    + "You have sent UGX 5,000 to TEST PAYEE 0700000901. Fee UGX 0. Transaction ID: 44445555666.";
  assert.deepEqual(paymentEvidence(thread, fixtures.ownerNumbers), { transactionId: "44445555666", amount: 5000, network: "mtn" });
  assert.deepEqual(paymentEvidence("Balance 5000", {}, { bare: false }), { transactionId: null, amount: null, network: null });
  for (const text of ["HELLO WORLD", "ABCD-EFGH"]) assert.equal(paymentEvidence(text).transactionId, null, text);
  assert.equal(paymentEvidence("12345678901", {}, { bare: false }).transactionId, null);
});
test("one SMS with two ID labels stays one message, a misread older label keeps the newest amount, and phone numbers are not IDs", () => {
  const owners = fixtures.ownerNumbers;
  assert.deepEqual(paymentEvidence("You have sent UGX 5,000 to TEST PAYEE 0700000901. Financial Transaction Id: 35235299645. External Transaction Id: 99887766.", owners),
    { transactionId: "35235299645", amount: 5000, network: "mtn" });
  assert.deepEqual(paymentEvidence("You have sent UGX 1,000 to X. Transaction ld: 111.\nYou have sent UGX 5,000 to TEST PAYEE 0700000901. Transaction ID: 44445555666.", owners),
    { transactionId: "44445555666", amount: 5000, network: "mtn" });
  for (const phone of ["0776042484", "0776 042 484", "+256776042484", "256776042484", "776042484"]) assert.equal(paymentEvidence(phone).transactionId, null, phone);
});
test("screenshot text pairs the newest ID with its own paid amount across MTN and Airtel layouts, ignoring fee, tax and balance", () => {
  const owners = { mtn: "256776042484", airtel: "256752000111" };
  for (const [text, transactionId, amount] of [
    ["Y'ello. You have sent 5,000 UGX to TEST PAYEE 256776042484. Fee 0 UGX. Your new balance: 15,000 UGX. Financial Transaction Id: 48213907651.", "48213907651", 5000],
    ["You have paid UGX 20,000.00 to GOAL HINT. Transaction ID: 12345678901. Fee: UGX 0. Balance: UGX 3,500.", "12345678901", 20000],
    ["SENT.TID 49822222222. UGX 5,000 to TEST PAYEE 0752000111. Fee UGX 0. Bal UGX 15,000.", "49822222222", 5000],
    ["SENT.TID 49811111111. UGX 1,000 to TEST 0752000111. Fee UGX 0. Bal UGX 15,000.\nSENT.TID 49822222222. UGX 5,000 to TEST 0752000111. Bal UGX 10,000.", "49822222222", 5000],
    ["You have senl UGX 1,000 to X. Transaction ID: 11111111111.\nYou have senl UGX 5,000 to X. Transaction ID: 22222222222.", "22222222222", 5000],
    ["You have sent UGX 5,000 to TEST 0776042484. Transaction ID: 22222222222.\nYou have received UGX 20,000 from FRIEND. Transaction ld: 33333333333.", "22222222222", 5000],
    ["You have sent UGX 5 000 to X. Transaction ID: 55555555555.", "55555555555", 5000],
    ["You have sent UGX 5.000 to X. TID: 66666666666.", "66666666666", 5000],
    ["Payment successful. Amount: 20,000 Transaction ID: 77777777777", "77777777777", 20000],
    ["Sent 5000/= to TEST. ID: 88888888888", "88888888888", 5000],
  ]) {
    const found = paymentEvidence(text, owners, { bare: false });
    assert.deepEqual([found.transactionId, found.amount], [transactionId, amount], text);
  }
  assert.equal(paymentEvidence("Fee UGX 500. Balance UGX 12,000. Transaction ID: 12121212121.", owners, { bare: false }).amount, null, "no paid amount");
});
test("cut-off threads, secondary labels, agent and merchant codes and OCR misspellings still give the payment's own ID and amount", () => {
  const owners = { mtn: "256776042484", airtel: "256752000111" };
  for (const [text, transactionId, amount] of [
    ["to TEST 0752000111. UGX 1,000 ... Bal UGX 15,000.\nSENT.TID 49822222222. UGX 5,000 to TEST 0752000111. Fee UGX 0.", "49822222222", 5000],
    ["Financial Transaction Id: 11111111111. External Transaction Id: -.\nY'ello. You have sent UGX 5,000 to X. Financial Transaction Id: 22222222222.", "22222222222", 5000],
    ["Financial Transaction Id: 11111111111. External Transaction Id: -.\nY'ello. You have sent UGX 5,000 to X. Financial Transaction Id: 22222222222.\nBuy 1GB for UGX 1,000 now", "22222222222", 5000],
    ["PIN CHANGED.TID 49811111111. Your Airtel Money PIN was changed.\nSENT.TID 49822222222. UGX 5,000 to TEST 0752000111. Fee UGX 0. Bal UGX 10,000.", "49822222222", 5000],
    ["CASH OUT.TID 49811111111. UGX 50,000 withdrawn at AGENT X, Agent ID: 123456. Fee UGX 1,500. Bal UGX 20,000.\nSENT.TID 49822222222. UGX 5,000 to TEST 0752000111. Bal UGX 15,000.", "49822222222", 5000],
    ["PAID.TID 49822222222. UGX 5,000 to GOAL HINT, Merchant ID: 123456. Fee UGX 0.", "49822222222", 5000],
    ["You have paid UGX 5,000 to GOAL HINT MoMoPay ID: 123456. Transaction ID: 48213907651.", "48213907651", 5000],
    ["You have sent 5,000 UGX to X. Your new ba1ance: 15,000 UGX. Financial Transaction Id: 48213907651.", "48213907651", 5000],
  ]) {
    const found = paymentEvidence(text, owners, { bare: false });
    assert.deepEqual([found.transactionId, found.amount], [transactionId, amount], text);
  }
  assert.equal(paymentEvidence("Transaction ID: Confirmed. You have sent UGX 5,000.", owners, { bare: false }).transactionId, null, "a word is not an ID");
});
test("sameTransactionId allows look-alikes and one slip in IDs of eight or more characters, and nothing else", async () => {
  const { sameTransactionId } = await import("../src/domain/payment-sms.ts");
  for (const [typed, read] of [["48213907651", "48213907651"], ["482139O765I", "48213907651"], ["48213907650", "48213907651"], ["4821390765", "48213907651"],
    ["ABCD1234", "ABCD123"], ["TEST.MTN.003", "TESTMTN003"]]) assert.equal(sameTransactionId(typed, read), true, `${typed} ~ ${read}`);
  for (const [typed, read] of [["48213907651", "99999999999"], ["48213907651", "48213907600"], ["1234", "1235"], ["123456", "12345"]]) assert.equal(sameTransactionId(typed, read), false, `${typed} ≁ ${read}`);
});
