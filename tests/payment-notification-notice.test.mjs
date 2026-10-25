import assert from "node:assert/strict";
import test from "node:test";
import { noticeRetryDelay, noticeTargetType, paymentNoticeLabel, paymentNoticeRules, paymentNotificationNotice } from "../src/domain/payment-notification.ts";

const now = Date.parse("2026-10-25T12:00:00Z");

test("payment notification notices distinguish provider acceptance from handset delivery", () => {
  const notice = paymentNotificationNotice("sent");
  assert.equal(notice, "SMS accepted for delivery.");
  for (const status of ["sent", "queued", "uncertain", "failed", "unsupported", "unavailable"]) {
    assert.doesNotMatch(paymentNotificationNotice(status), /delivered|received/iu, status);
  }
});

test("failed, uncertain, unsupported and unavailable payment messages tell the administrator to contact the member", () => {
  for (const status of ["failed", "uncertain", "unsupported", "unavailable"]) {
    assert.match(paymentNotificationNotice(status), /Contact the member\./u);
  }
  assert.match(paymentNotificationNotice("failed"), /could not be sent/u);
  assert.match(paymentNotificationNotice("uncertain"), /could not be confirmed/u);
  assert.match(paymentNotificationNotice("uncertain"), /not be resent automatically/u);
  assert.match(paymentNotificationNotice("queued"), /retry it automatically/u);
  assert.match(paymentNotificationNotice("unsupported"), /not supported/u);
  assert.match(paymentNotificationNotice("unavailable"), /no registered phone number/u);
});

test("unrelated and unrecognized response fields never become notification copy", () => {
  for (const value of [undefined, null, false, {}, "pending", "accepted", "__proto__", "constructor", "provider-secret-response"]) {
    assert.equal(paymentNotificationNotice(value), null);
  }
});

test("owner notice labels never present gateway acceptance as receipt", () => {
  const row = (state, lastError = null, attempts = 0, age = 0) => paymentNoticeLabel({ state, lastError, attempts, createdAt: new Date(now - age).toISOString() }, now);
  assert.equal(row("accepted"), "Accepted by the SMS gateway (not proof of receipt)");
  assert.equal(row("pending"), "Waiting to send");
  assert.equal(row("pending", null, 0, paymentNoticeRules.stuckAfterMs + 1), "Waiting · check SMS settings and the members worker");
  assert.equal(row("pending", "rejected", 2), "Refused by the gateway · retrying automatically");
  assert.equal(row("uncertain", "uncertain"), "Not confirmed · not resent automatically");
  assert.equal(row("failed", "rejected"), "Refused by the SMS gateway");
  assert.equal(row("failed", "expired"), "Not sent within a day");
  assert.equal(row("failed", "invalid"), "Not sent");
  assert.equal(row("skipped", "unsupported"), "Country not supported");
  assert.equal(row("skipped", "unavailable"), "No registered number");
  for (const state of ["accepted", "pending", "uncertain", "failed", "skipped"]) assert.doesNotMatch(row(state), /\bdelivered\b|\breceived\b/iu);
});

test("retries back off from the cron's five minutes, capped at an hour, and renewals name their access period", () => {
  for (const [attempt, ceiling] of [[1, 5], [2, 10], [3, 20], [4, 40], [5, 60], [9, 60]]) {
    assert.equal(noticeRetryDelay(attempt, 0), ceiling * 60_000 / 2);
    assert.equal(noticeRetryDelay(attempt, 0.999_999), Math.floor(ceiling * 60_000 / 2 + 0.999_999 * ceiling * 60_000 / 2));
  }
  assert.equal(noticeTargetType("renewed"), "access-code");
  for (const kind of ["approved", "rejected", "credited"]) assert.equal(noticeTargetType(kind), "payment");
});
