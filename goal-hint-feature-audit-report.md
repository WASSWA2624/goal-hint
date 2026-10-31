# Goal Hint — remaining work

Updated: 31 October 2026 (Africa/Kampala). Task IDs refer to the [audit prompt](prompts/goal-hint-feature-audit.md), with subsequent user-approved scope changes preserved.

Implementation and actual verification evidence: [referral reviews](next-js/dev-plan/207-approved-referral-reviews.md), [phone polling](next-js/dev-plan/208-phone-builder-polling.md), [data/release checks and decision recommendations](next-js/dev-plan/209-release-data-verification.md). Earlier completed work remains in its implementation notes.

| Work group | Status | Remaining gap / next action |
|---|---|---|
| Notifications and subscription reminders — 8, 9 | Decision needed | Decide whether prediction/result alerts are required, with their audience and triggers. |
| Prediction/slip sharing and related mobile fixes — 5, 12 | Decisions needed | Decide individual-prediction sharing and whether to change shared-page expansion. |
| Registration/referral security — 7 | Decision needed | Decide optional purpose-specific OTP shortening; registration/phone verification and password recovery retain their approved 24-hour lifetimes. |
| Match details and prediction-performance data verification — 10, 11 | Unable to verify; decisions needed | Verify provider accuracy/freshness and player coverage/display rights; approve evaluation, cohorts and market/reporting windows before publishing withheld metrics. |
| Other mobile gaps and release verification — remaining 12 | Unverified | Restore hosting/admin access (suspended HTTP 403; SSH rejected), then qualify ingress, deployment/migrations/grants, workers/delivery and account/access journeys. Resolve Android toolchain/signing prerequisites; verify signed installation and physical-device/WebView polling, sharing, downloads and deep links. |

Recommended next batch: **production recovery and release qualification**, once hosting and administrative access are restored.
