# Goal Hint — App Overview

**Reviewed: 3 November 2026.** Reflects the current source checkout; production deployment and release approval are separate.

## Purpose and users

Goal Hint helps adult football followers browse fixtures, understand predictions, assemble slips, and check outcomes. Members obtain access through subscriptions, trials, or referral days; administrators manage access, payments, and reporting.

It combines a responsive website with a Flutter host for the same experience. Bet placement, stakes, and bookmaker payment processing are outside its scope.

## What has been implemented

| Area | What it does |
| --- | --- |
| **Best Slips — homepage** | Stored daily slips with odds, probabilities, match counts, outcomes, date filters, pagination, individual pages, and history. Publishes up to 20 qualifying slips per odds band: 1.5–5, 5–10, 10–20, 20–50, and 50–100 (up to 100 daily). Yesterday's summary and result drilldowns retain the chosen band. |
| **Matches, Live, and Results** | Scheduled, live, and completed fixtures with automatic score/result refresh. Team/league/country search; date/time, competition, country, market, probability, and available-odds filters. Date ranges span up to 31 days. Sorting, pagination, and URL state preserve applied views. |
| **Match details** | Teams, kickoff, scores, progress, and predictions; statistics, form, head-to-head, standings/brackets, lineups and players, injuries, events, venue/officials, markets, analysis/news, sources, and revisions. Missing data remains unavailable. |
| **Predictions** | Match result (home/draw/away), double chance, over/under 2.5 goals, and both teams to score, with estimated probabilities, sources, explanations, and revisions. Optional AI and API-Football fallback paths validate evidence. Recommendations consider probability, football evidence, and exact available prices. |
| **Slip Builder** | Generates combinations using date/time, markets and outcomes, individual/total odds, probability, match count, slip count, and match-reuse limits. Signed-in users can save up to ten named filter presets and choose a default. Generated personal slips stay in browser memory; account saves and personal slip history have been removed. |
| **Slip sharing** | **Download image** and **Share** prepare branded PNGs; long browser exports use a ZIP, and updated native hosts offer system file saving. Stable eight-digit slip references use a fingerprint registry without storing personal selections. Published Best Slips use canonical links; existing shared links remain valid. |
| **Member accounts** | Phone and password registration/login, verification, recovery, phone/password changes, device management, and activity. Two active sessions are allowed; a third login replaces the oldest. Paid-device limits apply separately. Configurable trials start at registration and require phone verification before use. |
| **Messaging and notifications** | YoolaSMS delivers verification/recovery codes through SMS or WhatsApp. A private inbox covers payment decisions, access activation/expiry, and referrals, with unread badges and read/dismiss controls. Administrators configure event templates and queued account messages; WhatsApp updates require consent. Current checkout status updates are in-app; external messaging depends on the event, provider configuration, and worker. |
| **Subscriptions, payments, and approvals** | Configurable access packages, MTN MoMo/Airtel payment reporting, administrator receipt verification and approval, wallet credit, referral-day redemption, renewals, and optional credit-funded auto-renewal. See the dedicated payment flow below. |
| **Referrals** | Personal links with eight-digit invitation codes support copy, WhatsApp/Telegram, and device sharing without a subscription; legacy codes remain valid. An eligible friend's first phone verification awards one redeemable day, independently of payment. Accounts show rewards/activity; evidenced abuse reviews support member appeals. |
| **Results and performance** | Prediction outcomes by market, source, and league; published-slip results, illustrative unit-stake returns/ROI, and losing streaks. Correct, incorrect, pending, void, and unavailable stay distinct. Accuracy/calibration metrics require reviewed policies and sufficient samples; illustrations do not represent customer profits. |
| **Administration and analytics** | Payment review and legacy reversals, subscriber search, manual access grants/extensions/revocation, account blocking/sign-out, verified number transfers, credit adjustments, erasure, plans, sales/trial/device settings, audit history, revenue summaries, and forecast-source comparisons. First-party visitor analytics provides reports and exports. |
| **Security, privacy, and discovery** | Hashed passwords/codes, request throttling, server authorization, private account/payment responses, and controlled erasure with accounting safeguards. Analytics requires consent and honors browser privacy signals. Canonical/social metadata, crawlable archives, robots rules, and sitemaps control public discovery. |
| **Interface and support** | Responsive components, remembered light/dark themes, English, help, privacy, terms, support links, and Android/Windows downloads with install/update prompts for new releases. Availability depends on published installers/store configuration. |

## Payment integration and approvals

MTN MoMo/Airtel Money transfers are paid manually in UGX to configured wallets. The app handles checkout, evidence, reconciliation, and access activation; direct provider-API collection and automatic external-payment confirmation are not implemented.

1. **Choose and pay:** **Package → Pay → Details → Review** combines package purchases, wallet contributions, and referral days. Wallet/referral-only purchases complete after explicit member confirmation without external receipt review.
2. **Submit evidence:** members provide transaction details and a message or screenshot. Local OCR assists entry; evidence never confirms that money arrived. External requests remain pending.
3. **Verify and approve:** **Admin → Payments** provides a searchable queue. An authenticated administrator checks the actual wallet transaction: provider, ID, amount, recipient, time, and sender. Receipt verification and approval are separate actions; discrepancies, ownership, and sufficient funding must be resolved first.
4. **Activate access:** approval allocates receipts once, spends reserved balances, credits eligible excess, and grants/extends subscription time atomically. Renewals preserve existing time; signed-in pages refresh automatically without activation-code entry. Top-ups credit the wallet without granting access.
5. **Handle exceptions:** corrections, rejection with a reason, ownership disputes, and shortfalls have workflows. Legacy payments support reversal; current checkout uses reconciliation and ownership resolution. Members track/correct reports. Duplicate-receipt checks, reviewer conflict checks, private evidence, and append-only audit history protect decisions.

See [payment checkout and reconciliation](next-js/docs/payment-checkout.md) for detailed rules and deployment requirements.

## Access and everyday use

Visitors can browse fixtures, scores, slip summaries, completed match predictions, and released slip results. Upcoming/live predictions, detailed insights, slip generation, and restricted controls require server-verified entitlement. Access expires automatically; closing subscription sales preserves existing access checks. Administrators receive dashboard and member access.

Completed public slips can use the sharing drawer without a subscription; unfinished selections remain protected. Exports preserve original picks, odds, and captured outcomes. Their **Average probability** is the mean of selection forecasts, not the probability that the entire slip wins. Images can be forwarded independently of website access.

A typical journey is **browse → inspect a match → register and verify → obtain access → build/share slips → check results**.

## How the app works

- **Shared application:** `next-js/` owns screens, APIs, authorization, and business rules: Next.js/React, TypeScript, shared styled-components themes, Redux, and Prisma with MySQL/MariaDB support.
- **Football processing:** private workers import API-Football data, prepare seven-day prediction runs using East Africa dates, refresh live data, publish revisions/slips, and settle results. Browsing reads stored data. Coverage depends on provider access/evidence.
- **Prediction integrity:** forecasts lock five minutes before scheduled kickoff. Settlement uses verified regulation scores, including stoppage time, excluding extra time/shootouts. Postponements, cancellations, voids, and score corrections preserve audited history. Live scores do not settle predictions.
- **Native and offline:** Flutter supplies persistent sessions, themed recovery, Android pull-to-refresh, external/app links, and sharing. Reconnection and safe cache updates retain the last usable bundle. Prepared anonymous fixture facts/scores remain available for up to 24 hours with staleness notices; predictions, accounts, payments, and writes require connectivity.
- **Operations:** synthetic demo data, automated tests, deployment/package scripts, quota/cost controls, durable job recovery, backup/restore, and monitoring foundations. Production scheduling and services need configuration and approval.

## Current boundaries and unfinished work

- **Rollout requirements:** odds bands, transient personal slips, and readable slip/referral codes are committed to `main`. Deployment needs their database migrations/grants, updated web/workers, and rebuilt native hosts. Follow-up export refinements were uncommitted when reviewed.
- **Conditional features:** live odds, AI/research, joint-slip estimates, and accuracy claims require permissions, credentials, evidence, and qualification. Demo output establishes no live availability or prediction quality.
- **Partial foundations:** expanded goal/bookmaker-implied markets have derivation/storage/settlement groundwork; public activation is unfinished. Owner cost accounting lacks a complete profit service/interface. Some legal/publication and unattended-operation checks remain open.
- **Platform gaps:** Android/Windows have recorded local execution evidence; Apple requires host/device qualification, and Linux lacks a qualified browser. Signing, domain app links, stores, hosting, and full release acceptance remain separate work.
- **Scope limits:** additional languages, advertising, exact-score public forecasts, and match/result alerts are not delivered. Predictions are estimates, never guarantees.

For setup and implementation evidence, see the [web guide](next-js/README.md), [slip lifecycle and odds bands](next-js/docs/best-slip-odds-bands.md), [slip sharing](next-js/docs/slip-sharing.md), [web tracker](next-js/dev-tracker.md), and [Flutter tracker](flutter/dev-tracker.md). Older specifications may describe superseded behavior.
