# Goal Hint — remaining work

Updated: 31 October 2026 (Africa/Kampala). Task IDs refer to the [audit prompt](prompts/goal-hint-feature-audit.md), with subsequent user-approved scope changes preserved.

Latest batch verification: **191 focused tests and six genuine MySQL cases passed**, zero final failures/skips; production Next transport checks, TypeScript and lint passed. Local migration/schema verification passed and health is **ready**. [Security evidence and limitations](next-js/dev-plan/206-registration-referral-security.md) preserve actual results; [earlier audit evidence](next-js/dev-plan/201-invite-friends.md#remaining-work-audit--31-october-2026) and other implementation notes remain historical.

| Work group | Status | Remaining gap / next action |
|---|---|---|
| Notifications and subscription reminders — 8, 9 | Decision needed | Decide whether prediction/result alerts are required, with their audience and triggers. |
| Prediction/slip sharing and related mobile fixes — 5, 12 | Decisions needed | Decide individual-prediction sharing and whether to change shared-page expansion. |
| Registration/referral security — 7 | Workflow pending; decision needed | Implement the [approved manual review/reversal policy](next-js/docs/referral-fraud-review-proposal.md); decide whether to shorten the retained 24-hour account/recovery OTP lifetimes. |
| Match details and prediction-performance data verification — 10, 11 | Unable to verify; decisions needed | Verify provider accuracy/freshness and player coverage/display rights; approve evaluation, cohorts and market/reporting windows before publishing withheld metrics. |
| Other mobile gaps and release verification — remaining 12 | Partial; release Unverified | Add phone builder polling. Qualify production proxy chain/ingress, deployment/migrations/grants, workers/existing delivery and account/access journeys; verify Android packaging and signed physical-device installation, sharing, downloads and deep links. |

Recommended next batch: **approved manual referral review and unused-reward reversal workflow (task 7)**.
