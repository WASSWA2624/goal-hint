# 025 — Implement full, independent odds-price ingestion

**Phase:** Odds  
**Key prerequisites:** [003 — Define lossless, temporal provider-data contracts](003-record-contracts.md); [004 — Implement resource-level completeness tracking](004-completeness-ledger.md); [005 — Define the shared versioned market registry](005-market-registry.md); [008 — Persist responses and normalize them idempotently](008-transactional-ingestion.md); [009 — Coalesce requests and reuse fresh shared responses](009-shared-fetch-cache.md); [010 — Implement documented batching and resumable pagination](010-batching-pagination.md); [020 — Implement Worker 1: live match updates](020-live-worker.md); [021 — Implement Worker 2: current-day refresh and reconciliation](021-daily-refresh-worker.md); [022 — Implement Worker 3: resumable historical backfill](022-historical-worker.md); [024 — Reconcile bookmaker and separate pre-match/live market catalogs](024-odds-catalog-mapping.md)

## Required context

Read [GLOBAL-RULES.md](support/GLOBAL-RULES.md) and the completed earlier handoffs. Execute only this prompt’s task. Preserve the existing application, design and paid-access controls.

Use source references **R4** in [REFERENCES.md](support/REFERENCES.md); verify the applicable provider/account behavior during implementation.

## Single task

Implement normalized pre-match/live price ingestion and connect it to the existing shared worker jobs and stored receipts.

## Source requirements

The following excerpts retain the original requirements. Original section numbers and R-references refer to the bundled source, not this file’s headings.

### Price endpoints

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 41–42, 72, 74.*

| Dataset | Endpoint(s) | Required ingestion scope |
|---|---|---|
| Pre-match prices | `/odds` | All available bookmakers, markets, outcomes, lines, and pages for the requested fixtures/date scope. |
| Live prices | `/odds/live` | Available live selections, lines, prices, and availability/status flags. |

### Price fields

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 87.*

- **Forecasts/prices:** provider advice and numeric forecasts where supplied, comparison components and source history; bookmaker identity when present, market/outcome IDs, raw labels, handicaps/lines, decimal prices, provider update time, observation time, and suspension/main-selection flags.

### Price ingestion and evidence rules

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 227–228, 231, 233.*

2. Fetch all pages of prices for the required scope without restricting to one bookmaker or one bet type. Normalize each exact combination of fixture, phase, period, market, line, selection, player/team, and bookmaker/source.
3. Store provider timestamps, observation timestamps, availability, and price history without duplicating identical snapshots. A returned live source must not be assigned an invented bookmaker identity.

6. Reject malformed prices and respect suspension flags. Label stale prices with their timestamp rather than presenting them as current offers.

8. An odds-only change updates prices. It must not rerun an odds-independent probability model unless its declared inputs actually include odds.

### Odds pagination

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 126.*

| Request | Required treatment |
|---|---|
| `/odds` | Follow all pages; documented page size is **10 results**, not 10 selected bookmakers. Do not apply a bookmaker/bet filter when importing full available coverage. |

## Scope boundary

Implement price ingestion only. A live source is not an invented bookmaker, and a price is not evidence that GoalHint can forecast its market.

## Acceptance checks

- [ ] Fetch every available page/bookmaker/market/outcome/line for the required scope, without narrowing full coverage to a chosen bookmaker or bet type.
- [ ] Normalize exact fixture/phase/period/market/line/selection/player/team/source combinations with provider and observation times.
- [ ] Retain history without identical-snapshot duplicates, preserve availability/suspension and reject malformed prices.
- [ ] Reuse Worker 1 live-odds capture and other due jobs rather than introducing a parallel poller; odds-only updates do not rerun odds-independent models.

## Handoff

Return actual changed files/artifacts, check commands and results, configuration or migration changes, and any evidence-backed deviations or blockers. Do not claim unverified outcomes.

Next in sequence: [026 — Select and label the correct displayed reference odds](026-odds-reference-prices.md).
