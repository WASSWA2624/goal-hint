# Goal Hint — App Overview

**Reviewed: 3 November 2026.** Covers the current source checkout, including local changes identified below; production deployment and release approval are separate.

## Purpose and users

Goal Hint helps football followers browse fixtures, understand estimated predictions, assemble slips, and check recorded outcomes. Members obtain access through subscriptions, trials, or referral days; administrators manage access, payments, and reporting.

It combines a responsive website with a Flutter host for the same experience. Bet placement, stakes, and bookmaker payment processing are outside its scope.

## What has been implemented

| Area | What it does |
| --- | --- |
| **Best Slips — homepage** | Stored daily selections with odds, probabilities, match counts, and outcomes. Supports date/odds-band filters, pagination, individual slip pages, and history. The local update supports up to 20 qualifying slips per band: 1.5–5, 5–10, 10–20, 20–50, and 50–100. Requires suitable forecasts, permitted prices, and a qualified joint model. |
| **Matches, Live, and Results** | Scheduled, live, and completed fixtures; team/league/country search; date/time, competition, country, market, probability, and available-odds filters. Date ranges span up to 31 days. Sorting, pagination, and URL state preserve applied views. |
| **Match details** | Shows teams, kickoff, scores, match progress, and predictions. Available sections cover statistics, recent form, head-to-head, standings, lineups and players, injuries, events, venue and officials, markets, analysis/news, sources, and prediction revisions. Missing information remains explicitly unavailable. |
| **Predictions** | Match result (home/draw/away), double chance, over/under 2.5 goals, and both teams to score, with estimated probabilities, sources, explanations, and revisions. Optional AI and API-Football fallback paths validate evidence. Recommendations consider probability, football evidence, and exact available prices. |
| **Slip Builder** | Generates combinations using date/time, markets and outcomes, individual/total odds, probability, match count, slip count, and match-reuse limits. Signed-in users can manage up to ten named filter presets and choose a default. In the current local implementation, generated personal slips are transient; presets are saved, selections are not. |
| **Slip sharing** | Branded images, device sharing, and downloads, including ZIPs for long slips. Published Best Slips have canonical links; existing shared-slip links remain supported. Local updates add eight-digit references, revised exports, and native saving. Images contain selections and can be forwarded independently of website access. |
| **Member accounts** | Phone-and-password registration/login, SMS or WhatsApp verification, password recovery, phone/password changes, session/device management, and sign-out. Accounts show subscription expiry, payments, wallet credit, referrals, private notifications, and activity. Registration trials use the administrator-configured duration. |
| **Subscriptions, payments, and approvals** | Configurable access packages, MTN MoMo/Airtel payment reporting, administrator receipt verification and approval, wallet credit, referral-day redemption, renewals, and optional credit-funded auto-renewal. See the dedicated payment flow below. |
| **Referrals** | Personal invitation links attribute eligible new registrations. First successful phone verification awards the inviter one redeemable day, independently of payment. Accounts show rewards and referral activity. Administrators can investigate evidenced abuse; affected members can appeal reversals. |
| **Results and performance** | Prediction outcomes by market, source, and league; original published-slip results. Correct, incorrect, pending, void, and unavailable outcomes stay distinct. Accuracy/calibration metrics require reviewed policies and sufficient samples. |
| **Administration and analytics** | Private dashboards cover payment review, subscribers, access codes, plans, referral reviews, settings, audit records, revenue summaries, and forecast-source comparisons. Consent-based first-party visitor analytics provides reports and exports. |
| **Interface and support** | Responsive components, remembered light/dark themes, English content, help, privacy, terms, support links, and Android/Windows download/update entry points. Downloads depend on published installers/store configuration. |

## Payment integration and approvals

MTN MoMo and Airtel Money payments are made manually in UGX to the configured receiving wallets. The app implements checkout, evidence handling, reconciliation, and access activation. Direct provider-API collection and automatic confirmation of external transfers are not implemented.

1. **Choose and pay:** a signed-in member selects a package and follows **Package → Pay → Details → Review**. Wallet credit can fund all or part of the price; referral days can extend a package or be redeemed separately. Top-ups add wallet credit.
2. **Submit evidence:** the member supplies transaction details and a message or screenshot, reviews the extracted information, and submits. Local OCR assists entry; screenshots and pasted messages are evidence, never confirmation that money arrived. External requests remain pending.
3. **Verify and approve:** **Admin → Payments** provides a searchable review queue. An authenticated administrator checks the actual receiving-wallet transaction, confirms the provider, transaction ID, amount, recipient, receipt time, and sender, and records receipt verification. Approval is a separate action, available after evidence discrepancies and ownership issues are resolved and sufficient funding is verified.
4. **Activate access:** approval allocates receipts once, spends reserved wallet/referral balances, credits eligible excess, and creates or extends the account's subscription in one database transaction. Renewals queue after current access. Signed-in pages refresh automatically; no activation-code entry is required. A top-up credits the wallet rather than granting subscription time.
5. **Handle exceptions:** administrators can request corrections, reject with a reason, or investigate disputed ownership. Shortfalls await additional verified funds. Members can track status and correct reports. Duplicate-receipt checks, reviewer conflict checks, private evidence, and append-only audit events protect the workflow. Wallet/referral-only purchases complete after explicit member confirmation without external receipt review.

See [payment checkout and reconciliation](next-js/docs/payment-checkout.md) for detailed rules and deployment requirements.

## Access and everyday use

Visitors can browse fixtures, scores, slip summaries, completed match predictions, and released slip results. Upcoming/live predictions, detailed insights, slip generation, and restricted controls require current entitlement, enforced on the server. Signing in alone does not grant access. Administrators receive dashboard and member access.

A typical journey is **browse → inspect a match → register and verify → obtain access → build/share slips → check results**. Checkout accepts earned days and wallet credit; external payments await review.

## How the app works

- **Shared application:** `next-js/` owns screens, APIs, authorization, and business rules: Next.js/React, TypeScript, shared styled-components themes, Redux, and Prisma with MySQL/MariaDB support.
- **Football processing:** private workers import API-Football data, prepare seven-day prediction runs using East Africa reporting dates, refresh live data, publish revisions/slips, and settle results. Browsing reads stored data. Cutoff locks preserve original forecasts; corrections are audited. Coverage depends on provider access and evidence.
- **Native and offline:** Flutter supplies navigation, persistent sessions, themed loading/recovery, external links, and sharing. An anonymous cache shows saved fixture facts/scores for up to 24 hours after preparation, with staleness notices. Predictions, accounts, payments, and writes require an online server.
- **Operations:** synthetic demo data, automated tests, deployment/package scripts, quota/cost controls, recovery, backup/restore tooling, and monitoring foundations. Production scheduling and services require configuration and approval.

## Current boundaries and unfinished work

- **Local work:** odds bands, transient personal slips, refreshed sharing/native saving, and readable slip/referral codes were already uncommitted when reviewed. They require the corresponding migrations, deployment, and rebuilt native hosts; this document does not assert they are on a released build.
- **Conditional features:** production odds display, AI/research operation, joint-slip estimates, and public accuracy claims depend on permissions, configuration, evidence, and qualification. Synthetic demo output does not establish live availability or prediction quality.
- **Partial foundations:** expanded goal-based and bookmaker-implied markets have derivation, storage, and settlement groundwork, with activation/public coverage unfinished. Owner cost accounting has schema/arithmetic foundations but no complete profit service or interface.
- **Platform/release gaps:** Android and Windows have implementation and recorded local execution evidence. Apple adapters exist but require Apple-host/device qualification; Linux has no qualified embedded browser. Signed releases, verified app links, store publication, hosting, and full platform acceptance remain separate release work.
- **Scope limits:** English is the implemented language. Additional languages, advertising, exact-score public forecasts, and guaranteed prediction accuracy are not delivered features.

For setup and detailed implementation evidence, see the [web guide](next-js/README.md), [web tracker](next-js/dev-tracker.md), and [Flutter tracker](flutter/dev-tracker.md). Older specifications may describe superseded behavior.
