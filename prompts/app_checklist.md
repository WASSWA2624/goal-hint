# Football Prediction App — Implementation Checklist

Use this checklist to audit the existing application. Items are recommendations to verify, not claims that they have been implemented.

## Pages and visibility
- [ ] Best Slips: generate daily slips, show combined odds, estimated combined probability and number of selections.
- [ ] All Predictions: browse and filter all matches, markets, odds and probabilities, including low-probability picks.
- [ ] Live Matches: update scores and detailed statistics while retaining the original pre-match prediction.
- [ ] Historical Results: display completed matches and slips, including losses, original odds and outcomes.
- [ ] Non-subscribers see that premium slips exist but cannot view active picks, odds or probabilities.
- [ ] Publish full details of completed slips, including losing slips, for transparency.

## Slip generation and probability
- [ ] Rank Best Slips primarily by estimated **combined probability**, not average selection probability.
- [ ] Display average selection probability separately, alongside combined probability and total odds.
- [ ] Multiply selection probabilities only when independence is reasonable; account for correlated outcomes.
- [ ] Optimise for highest whole-slip probability within user-defined combined odds targets.
- [ ] Do not assume that fewer selections always means a safer slip.
- [ ] Support minimum/maximum odds, probability and selections per slip, plus requested slip count.
- [ ] Support optional overlapping selections in the custom slip builder; default Best Slips to diversified selections.
- [ ] Generate fewer slips when filters cannot be satisfied, with a clear explanation rather than an error.
- [ ] Preserve published slips and their original predictions for later auditing.

## API-Football and data pipeline
- [ ] Verify current plan pricing, rate limits, endpoint capabilities and redistribution permissions against official documentation.
- [ ] Fetch fixtures for the required upcoming period at midnight East Africa Time; upsert by stable fixture ID to avoid duplicates.
- [ ] Save all available match odds, statistics, market-specific predictions and source timestamps, including matches not selected for slips.
- [ ] Distinguish API predicted probability from bookmaker implied probability; do not label the latter as an independent prediction.
- [ ] Poll live fixtures centrally, cache or store latest state, then push updates to users rather than having each user call the provider.
- [ ] Verify which endpoints support batching and their actual refresh rates; budget requests for scores, statistics, odds and predictions.
- [ ] Update live match detail views for goals, cards, corners, possession and available statistics, noting that coverage varies.
- [ ] Overwrite current live snapshots rather than storing every minute indefinitely; retain final match details and key events.
- [ ] Automatically settle predictions and slips after results, including void, postponed and abandoned cases.
- [ ] Measure actual record size and monitor database storage growth instead of relying solely on estimates.

## Accuracy and refinement
- [ ] Use API-Football predictions as the initial baseline, without inventing probabilities for unsupported markets.
- [ ] Track realised win rates by market, league and predicted probability band, with sample counts.
- [ ] Assess calibration: predictions labelled 90% should win around 90% over sufficiently many comparable cases.
- [ ] Track individual-pick and whole-slip performance separately; include returns and losing streaks.
- [ ] Test Over 0.5, Over 1.5, Double Chance and Under 4.5 as candidate high-probability markets; validate with your own data.
- [ ] Later use AI to review injuries, team news, form, lineups and external predictions; flag conflicts first.
- [ ] Keep original and AI-refined predictions side by side; change published probabilities only after demonstrated improvement.
- [ ] Avoid guaranteed-win or fixed-accuracy promises.

## Performance and transparency
- [ ] Provide a public results dashboard showing winning and losing slips, odds, dates and outcomes.
- [ ] Include win rate, calibration, number of predictions, sample sizes and returns over selected periods.
- [ ] Preserve original publication timestamps and audit edits or corrections.
- [ ] Never quietly delete failed predictions or replace pre-match forecasts with post-match information.

## Pricing, access and payments
- [ ] Offer identical premium features for UGX 1,000 per 24 hours, UGX 5,000 per 7 days and UGX 20,000 per 30 days.
- [ ] Start subscriptions at approval time, show expiry clearly and extend remaining access on early renewal.
- [ ] Retain free access to selected previews and historical performance after expiry.
- [ ] For manual MTN/Airtel payments: collect transaction ID and optional screenshot, notify admin, verify actual receipt, approve/reject and notify customer.
- [ ] Prevent duplicate transaction approvals and maintain payment audit logs and clear pending/approved/rejected states.
- [ ] Evaluate automated payment integration later; measure fees, hosting, API usage, taxes and net profit.
- [ ] Run a pricing pilot and compare conversion and renewal rates before changing prices.

## SMS and privacy
- [ ] Review Yoola SMS terms, data retention, security and privacy provisions.
- [ ] Treat SMS phone numbers, message contents and delivery metadata as accessible to the gateway operator.
- [ ] Keep SMS content minimal; avoid sensitive betting or financial information and passwords.
- [ ] Secure API keys, restrict staff access, and review Ugandan privacy and applicable betting-related regulations.

## Competitive positioning and quality checks
- [ ] Study BetMines and other relevant competitors for filters, scanner layout, historical performance and premium previews.
- [ ] Test mobile experience, access control, live updates, payment approval, settlement and historical accuracy.
- [ ] Prioritise trustworthy, verifiable predictions and transparent results over claims of guaranteed winnings.

## Recommended order
1. Audit each checkbox against actual screens, code and tests.
2. Correct combined probability calculations and slip ranking, including correlation checks.
3. Harden prediction snapshots, results reconciliation and public history.
4. Build calibration and performance reporting.
5. Refine slip filters, diversity and explanations.
6. Secure payments, subscription access and SMS privacy.
7. Pilot pricing and add optional AI refinement after measuring the baseline.

For each item record: **Implemented / Partial / Missing**, evidence, required change and priority.
