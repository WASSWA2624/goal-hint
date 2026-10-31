# Goal Hint — remaining work

Updated: 31 October 2026 (Africa/Kampala). Task IDs refer to the [audit prompt](prompts/goal-hint-feature-audit.md), with subsequent user-approved scope changes preserved.

Verification this audit: **261 focused tests passed, zero skips**; configured local database migration/schema verification passed and health is **ready**. [Audit evidence and limits](next-js/dev-plan/201-invite-friends.md#remaining-work-audit--31-october-2026) distinguish these fresh checks from earlier [notification](next-js/dev-plan/202-essential-account-notifications.md), [sharing](next-js/dev-plan/203-phone-slip-sharing.md) and [latest mobile/access](next-js/dev-plan/205-mobile-slip-status-and-spacing.md) verification.

| Work group | Status | Remaining gap / next action |
|---|---|---|
| Notifications and subscription reminders — 8, 9 | Decision needed | Decide whether prediction/result alerts are required, with their audience and triggers. |
| Prediction/slip sharing and related mobile fixes — 5, 12 | Decisions needed | Decide individual-prediction sharing and whether to change shared-page expansion. |
| Registration/referral security — 7 | Partially implemented; review needed | Review bot/suspicious-registration handling, trusted proxy provenance, the 24-hour OTP lifetime and proportionate fraud review/reversal policy. |
| Match details and prediction-performance data verification — 10, 11 | Unable to verify; decisions needed | Verify provider accuracy/freshness and player coverage/display rights; approve evaluation, cohorts and market/reporting windows before publishing withheld metrics. |
| Other mobile gaps and release verification — remaining 12 | Partial; release Unverified | Add phone builder polling. Qualify live deployment/migrations/grants, workers/existing delivery and account/access journeys; verify Android packaging and signed physical-device installation, sharing, downloads and deep links. |

Recommended next batch: **registration/referral security (task 7)**, kept separate from the other work groups.
