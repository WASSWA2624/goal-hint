const expiryFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Kampala", day: "numeric", month: "short", year: "numeric",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

/** Subscription times use the service's timezone, including the year at renewal boundaries. */
export function formatSubscriptionExpiry(instant: Date): string {
  return `${expiryFormat.format(instant)} EAT`;
}
