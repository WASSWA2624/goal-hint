import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createHash } from "node:crypto";
import { paidDatabase } from "./helpers/paid-database.mjs";
import { MysqlServerUnavailableError } from "./helpers/mysql-instance.mjs";
import { createCheckoutReview } from "../src/server/admin/checkout-review.ts";
import { jpeg } from "./helpers/payment-fixtures.mjs";

test("migration preserves legacy offers, evidence, competing claims and previously allocated money", { timeout: 180_000 }, async t => {
  const a = randomUUID(), b = randomUUID(), planId = randomUUID(), pending = randomUUID(), competitor = randomUUID(), approved = randomUUID();
  const at = new Date("2026-10-31T12:00:00Z"), image = jpeg(), imageSha = createHash("sha256").update(image).digest("hex");
  let fixture;
  try { fixture = await paidDatabase({ beforeCheckout: async root => {
    for (const [id, phone] of [[a, "256700000111"], [b, "256700000112"]]) await root.query(
      "INSERT INTO MemberAccount (id,phone,createdAt,lastSignInAt) VALUES (?,?,?,?)", [id, phone, at, at]);
    await root.query("INSERT INTO SubscriptionSettings (id,paywallMode,mtnNumber,mtnName,updatedAt,updatedBy) VALUES (1,'test','256700000901','TEST',?,'test')", [at]);
    await root.query("INSERT INTO SubscriptionPlan (id,name,durationDays,priceUgx,active,sortOrder,createdAt,updatedAt) VALUES (?,'Original Weekly',7,5000,TRUE,1,?,?)", [planId, at, at]);
    for (const [id, accountId, reference] of [[pending, a, "ABCD"], [competitor, b, "EFGH"]]) await root.query(
      "INSERT INTO PaymentSubmission (id,reference,source,accountId,planId,planName,durationDays,priceUgx,claimedNetwork,claimedTxnRef,claimedTxnKey,claimedAmountUgx,status,submittedAt,imageSha256) VALUES (?,?,'report',?,?,'Original Weekly',7,5000,'mtn','MIGRATE100','MIGRATE100',5000,'pending',?,?)",
      [id, reference, accountId, planId, at, id === pending ? imageSha : null]);
    await root.query("INSERT INTO PaymentScreenshot (submissionId,width,height,bytes,data) VALUES (?,1080,2400,?,?)", [pending, image.length, image]);
    await root.query("INSERT INTO PaymentSubmission (id,reference,source,accountId,planId,planName,durationDays,priceUgx,claimedNetwork,claimedTxnRef,claimedTxnKey,claimedAmountUgx,status,submittedAt,network,transactionRef,amountReceivedUgx,approvedTxnKey,decidedAt,decidedBy) VALUES (?,'JKLM','owner',?,?,'Original Weekly',7,5000,'mtn','PAID200','PAID200',5000,'approved',?,'mtn','PAID200',5000,'mtn:PAID200',?,'historical-reviewer')", [approved, a, planId, at, at]);
  } }); } catch (error) { if (!(error instanceof MysqlServerUnavailableError)) throw error; t.skip(error.message); return; }
  t.after(() => fixture.close());
  const { database } = fixture;
  const first = await database.query(tx => tx.paymentSubmission.findUniqueOrThrow({ where: { id: pending } }));
  assert.equal(first.workflowVersion, 2); assert.equal(first.status, "disputed"); assert.equal(first.reference, "ABCD"); assert.equal(first.source, "report");
  assert.equal(first.priceUgx, 5000); assert.equal(first.planName, "Original Weekly"); assert.equal(first.receivingNumber, "256700000901");
  const receipt = await database.query(tx => tx.paymentReceipt.findUniqueOrThrow({ where: { provider_transactionKey: { provider: "mtn", transactionKey: "MIGRATE100" } } }));
  assert.equal(receipt.disputed, true); assert.equal(receipt.allocatedSubmissionId, null);
  assert.equal(await database.query(tx => tx.paymentReceiptClaim.count({ where: { receiptId: receipt.id } })), 2);
  const old = await database.query(tx => tx.paymentReceipt.findUniqueOrThrow({ where: { provider_transactionKey: { provider: "mtn", transactionKey: "PAID200" } } }));
  assert.equal(old.allocatedSubmissionId, approved); assert.equal(old.verifiedBy, "historical-reviewer");
  const review = createCheckoutReview(database), detail = await review.detail(pending);
  assert.equal(detail.claims[0].legacyImage, true);
  assert.deepEqual(Buffer.from((await review.image(pending, detail.claims[0].id)).image), image);
  assert.equal(await review.image(competitor, detail.claims[0].id), null, "A claim ID cannot expose another request's evidence");
});
