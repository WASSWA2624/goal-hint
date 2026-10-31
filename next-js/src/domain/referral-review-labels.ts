import type { ReferralReviewReason, ReferralReviewStatus } from "./referral-reviews.ts";

export const referralReviewReasonLabel: Readonly<Record<ReferralReviewReason, string>> = {
  "duplicate-award": "Duplicate reward", "proven-self-referral": "Self-referral", "verified-abuse": "Verified registration abuse",
};
export const referralReviewStatusLabel: Readonly<Record<ReferralReviewStatus, string>> = {
  open: "Awaiting decision", "no-action": "Closed without removal", reversed: "Unused reward removed", appealed: "Appeal pending",
  upheld: "Decision upheld", restored: "Reward restored",
};
/** Display exact small remainders; accounting always keeps the original integer milliseconds. */
export function referralReviewTime(milliseconds: number): string {
  if (milliseconds <= 0) return "0 minutes";
  if (milliseconds < 1000) return `${milliseconds} ms`;
  const seconds = Math.floor(milliseconds / 1000), days = Math.floor(seconds / 86400), hours = Math.floor(seconds % 86400 / 3600), minutes = Math.floor(seconds % 3600 / 60);
  return [days ? `${days}d` : "", hours ? `${hours}h` : "", minutes ? `${minutes}m` : "", seconds % 60 ? `${seconds % 60}s` : "", milliseconds % 1000 ? `${milliseconds % 1000}ms` : ""].filter(Boolean).join(" ");
}
