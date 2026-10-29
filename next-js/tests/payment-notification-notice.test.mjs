import assert from "node:assert/strict";
import test from "node:test";
import { paymentNotificationNotice } from "../src/domain/payment-notification.ts";

test("payment notification notices distinguish provider acceptance from handset delivery", () => {
  const notice = paymentNotificationNotice("sent");
  assert.equal(notice, "Message accepted for delivery.");
  assert.doesNotMatch(notice, /delivered|received/iu);
});

test("a durable queued notice does not claim provider or handset acceptance", () => {
  assert.equal(paymentNotificationNotice("queued"), "Account update queued for delivery.");
  assert.doesNotMatch(paymentNotificationNotice("queued"), /accepted|sent|received/iu);
});

test("failed, unsupported and unavailable payment messages tell the administrator to contact the member", () => {
  for (const status of ["failed", "unsupported", "unavailable"]) {
    assert.match(paymentNotificationNotice(status), /Contact the member\./u);
  }
  assert.match(paymentNotificationNotice("failed"), /could not be confirmed/u);
  assert.match(paymentNotificationNotice("unsupported"), /not supported/u);
  assert.match(paymentNotificationNotice("unavailable"), /no registered phone number/u);
});

test("unrelated and unrecognized response fields never become notification copy", () => {
  for (const value of [undefined, null, false, {}, "pending", "__proto__", "constructor", "provider-secret-response"]) {
    assert.equal(paymentNotificationNotice(value), null);
  }
});
