import assert from "node:assert/strict";
import test from "node:test";
import { shareUnchanged } from "../src/domain/structural-sharing.ts";

const checkout = () => ({ availableWalletUgx: 2000, availableReferralDays: 1, lastMethod: "mtn", requests: [
  { id: "request-1", status: "pending", receipts: [{ id: "receipt-1", amountUgx: 5000, verified: false }] },
  { id: "request-2", status: "approved", receipts: [] },
] });

test("identical checkout views and normalized drafts retain their existing roots", () => {
  const view = checkout();
  const draft = { step: 0, planId: "weekly", usePackage: true, accepted: false, extracted: {}, editedEvidence: [], screenshot: null };
  assert.equal(shareUnchanged(view, structuredClone(view)), view);
  assert.equal(shareUnchanged(draft, { ...draft, usePackage: true, accepted: false }), draft);
  assert.equal(shareUnchanged(draft, structuredClone(draft)), draft);
});

test("a changed balance preserves requests and receipts and never mutates either snapshot", () => {
  const previous = checkout(), next = structuredClone(previous);
  next.availableWalletUgx = 1000;
  const beforePrevious = structuredClone(previous), beforeNext = structuredClone(next);
  const result = shareUnchanged(previous, next);
  assert.equal(result.availableWalletUgx, 1000);
  assert.notEqual(result, previous);
  assert.equal(result.requests, previous.requests);
  assert.equal(result.requests[0].receipts[0], previous.requests[0].receipts[0]);
  assert.deepEqual(previous, beforePrevious);
  assert.deepEqual(next, beforeNext);
});

test("changed statuses, receipt fields, array order and removed entries propagate", () => {
  const previous = checkout(), next = structuredClone(previous);
  next.requests[0].status = "approved";
  let result = shareUnchanged(previous, next);
  assert.equal(result.requests[0].status, "approved");
  assert.notEqual(result.requests, previous.requests);
  assert.notEqual(result.requests[0], previous.requests[0]);
  assert.equal(result.requests[0].receipts, previous.requests[0].receipts);
  assert.equal(result.requests[1], previous.requests[1]);
  next.requests[0].receipts[0].verified = true;
  result = shareUnchanged(previous, next);
  assert.equal(result.requests[0].receipts[0].verified, true);
  assert.notEqual(result.requests[0].receipts[0], previous.requests[0].receipts[0]);
  assert.deepEqual(shareUnchanged(previous.requests, next.requests.toReversed()).map(value => value.id), ["request-2", "request-1"]);
  assert.deepEqual(shareUnchanged(previous.requests, next.requests.slice(0, 1)), next.requests.slice(0, 1));
});

test("key order is immaterial but added and removed undefined keys are changes", () => {
  const previous = { first: 1, second: undefined };
  assert.equal(shareUnchanged(previous, { second: undefined, first: 1 }), previous);
  assert.deepEqual(shareUnchanged(previous, { first: 1 }), { first: 1 });
  const withoutOptional = { first: 1 };
  assert.notEqual(shareUnchanged(withoutOptional, previous), withoutOptional);
  assert.ok(Object.hasOwn(shareUnchanged(withoutOptional, previous), "second"));
  assert.notEqual(shareUnchanged({ first: null }, { first: undefined }).first, null);
});

test("primitive comparisons preserve Object.is semantics and non-plain values remain atomic", () => {
  assert.ok(Object.is(shareUnchanged(NaN, NaN), NaN));
  assert.ok(Object.is(shareUnchanged(0, -0), -0));
  for (const [previous, next] of [[new Date(0), new Date(0)], [new Map(), new Map()], [new Blob(), new Blob()]]) {
    assert.equal(shareUnchanged(previous, next), next);
    assert.equal(shareUnchanged(previous, previous), previous);
  }
  const previous = Object.assign(Object.create(null), { value: 1 });
  assert.equal(shareUnchanged(previous, Object.assign(Object.create(null), { value: 1 })), previous);
  assert.notEqual(shareUnchanged(previous, { value: 1 }), previous);
  const beforeRecord = Object.assign(Object.create(null), { value: 1, branch: { same: true } });
  const afterRecord = Object.assign(Object.create(null), { value: 2, branch: { same: true } });
  const recordResult = shareUnchanged(beforeRecord, afterRecord);
  assert.equal(Object.getPrototypeOf(recordResult), null);
  assert.equal(recordResult.branch, beforeRecord.branch);
  assert.equal(recordResult.value, 2);
});

test("sparse arrays, own special keys and nested optional fields are preserved", () => {
  assert.equal(shareUnchanged([], Array(2)).length, 2);
  assert.ok(Object.hasOwn(shareUnchanged(Array(1), [undefined]), 0));
  const previous = JSON.parse('{"__proto__":{"same":true},"value":1}');
  const next = JSON.parse('{"__proto__":{"same":true},"value":2}');
  const result = shareUnchanged(previous, next);
  assert.equal(Object.getPrototypeOf(result), Object.prototype);
  assert.equal(result.__proto__, previous.__proto__);
  assert.equal(result.value, 2);
});
