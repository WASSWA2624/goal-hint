/**
 * Subscription tests never contact a messaging provider, even when local credentials are configured. Decisions still write
 * their outbox rows through the direct enqueue; only delivery is replaced, and it leaves every row queued.
 */
export const silentPaymentNotifications = Object.freeze({
  async deliver() { return "queued"; },
});
