/** Subscription tests never contact a messaging provider, even when local credentials are configured. */
export const silentPaymentNotifications = Object.freeze({
  async approved() { return "unavailable"; },
  async rejected() { return "unavailable"; },
});
