# Best Slips hosted evidence, 21 November 2026

## Publication status

Both hosted web releases pointed to pushed commit `9e1d650b`. The active production football worker pointed to `a97c7664`. Staging's disabled football worker pointed to `9eca5127`. Both databases had 87 applied migrations and zero rows in `DailySlipPublication`, `PublishedSlip` and `PublishedSlipLeg` at 15:47 Kampala time. The signed-out Best Slips API returned `awaiting-publication` and zero slips for the 2.50–5.00 band on both hosts.

Both web profiles verified their public odds display approval. The running process list, systemd units and timers, and both app-account crontabs contained no Best Slips publisher. The inspected seven-day journal contained no publisher entries. The local forecast timers were active. The web joint-model binding was absent, and no private publisher binding was found in the inspected deployment directories. The current slip command requires an explicit, authorized binding that supplies a qualified model and independently verifies publication and odds rights. [Publisher operation](../daily-slip-publications.md)

## November 21 cohort

Each cohort used a pinned UTC observation clock and one repeatable-read database transaction under its own web database profile. The inputs were the public Matches competition scope, scheduled kickoffs on the November 21 Kampala reporting day, and the shared pre-kickoff publication deadline. The probe reused stored fixture projections, goal forecasts, current bookmaker quotes and the same upcoming featured-pick decision as Matches. It made no provider calls.

| Observed condition | Production, 15:53 Kampala time | Staging, 15:55 Kampala time |
| --- | ---: | ---: |
| Stored scheduled fixtures in scope | 949 | 1,238 |
| Before publication deadline | 801 | 717 |
| Upcoming forecasts and featured picks | 775 | 0 |
| Featured picks with an exact quote | 137 | 0 |
| Exact featured quotes at 75% pick probability or higher | 117 | 0 |
| Of those, quotes from the configured primary bookmaker | 0 | 0 |

Production's 117 priced picks included 107 extended-market selections and covered eight bookmakers. A price-only probe multiplied the exact offered decimals with integer arithmetic. It kept every combination within one bookmaker, allowed one pick per fixture and excluded repeated teams. Four bookmakers could each form a 2.50–5.00 product within eight legs. The shortest used four legs and one exact product was `2.698488`. Four bookmakers could also form a 5.00–10.00 product, with seven legs in the shortest example. The other four bands had no price-only combination within eight legs in that capture. The configured primary-bookmaker policy admitted zero of these original featured quotes. No combination had a qualified whole-slip win estimate.

## Evidence for model qualification

The read-only production inventory found 339 sealed active-occurrence close receipts in the audit window, all on November 21. Of those, 37 preserved a priced featured decision with quote snapshot and receipt identities and a quote timestamp no later than the decision. Seven of the 37 had a verified, sealed post-kickoff regulation result at capture. Staging had zero prospective frozen featured decisions. Both archives had zero published slips with outcomes. These are inventory counts before any narrower comparable-market and exact-settlement validation.

A qualification study can use frozen prospective picks, intact pre-decision quote receipts, original fixture occurrence and forecast revisions, and result and settlement evidence recorded before each study boundary. Freeze candidate selection, combination construction, calibration and dependence assumptions before evaluating separate later Kampala-day blocks. Evaluate held-out joint outcomes by price band and leg count, report coverage, abstentions, sample sizes and calibration uncertainty, and keep the independent approval gate. Historical display replay can help audit input coverage. Its reconstructed selections and recovered prices do not provide a prospective validation sample. The observed one-day prospective inventory cannot supply a chronological holdout or establish whole-slip calibration or dependence. [Point-in-time replay method](../november-forecast-replay.md) · [Joint slip evidence contract](../prediction-intelligence.md)

No publisher, model binding or slip was activated. The investigation made no hosted database, configuration or deployment changes.

## Migration verification

The overlay records the canonical SQL SHA-256 `f2921ff970c47a98bc06af9d8df7689aa051f9afe0e21278978a9e9dcff01c77`. Both append-only guards use compound trigger bodies for backup and restore compatibility. Nine deployment-script checks passed. An isolated MariaDB 11.4.13 dry run against a synthetic predecessor schema preserved version 1 and 2 rows, enforced the version 3 limit of ten and rejected missing prerequisites, replay and membership mutation.

Two raw SQL concurrency checks observed actual InnoDB lock waits. When different bands attempted to claim the same day's combination, the winning transaction committed and the duplicate claim rolled back the other publication and slip. A concurrent retry for the same publication inserted zero rows, then read the committed parent under a shared lock. Each race left one parent, slip and combination membership. These checks cover database behavior with synthetic rows.
