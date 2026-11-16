# 005 — Define the shared versioned market registry

**Phase:** Data contracts  
**Key prerequisites:** [001 — Audit the existing application and record the baseline](001-audit-baseline.md); [002 — Build the versioned provider endpoint inventory](002-endpoint-inventory.md); [003 — Define lossless, temporal provider-data contracts](003-record-contracts.md)

## Required context

Read [GLOBAL-RULES.md](support/GLOBAL-RULES.md) and the completed earlier handoffs. Execute only this prompt’s task. Preserve the existing application, design and paid-access controls.

## Single task

Reconcile the existing market-definition registry and establish the shared contract that odds mapping, models, display and settlement will use.

## Source requirements

The following excerpts retain the original requirements. Original section numbers and R-references refer to the bundled source, not this file’s headings.

### Registry contract

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 301–303.*

Use one **versioned market-definition registry across fixtures**. Each entry defines period, selection set, line/player/team parameters, settlement rules, evidence needs, model capability, source mappings, and display name. The registry is shared; applicable players, lines, available odds and supported predictions vary by fixture.

Reconcile the existing registry with API catalogs. Enumerate every catalog entry and map it explicitly, marking unsupported/unmapped entries with reasons rather than silently dropping them. Do not guess the contents of an unprovided market file.

### Market families to represent

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 305–320.*

Evaluate these families wherever the required evidence and models support them:

| Family | Required variants to consider |
|---|---|
| Results | Full-time home/draw/away; supported first-half and second-half results. |
| Double chance | Home/draw, home/away, draw/away for supported periods. |
| Draw no bet/handicaps | Supported draw-no-bet, European and Asian lines, with push/partial-settlement rules. |
| Total goals | Over/under **0.5, 1.5, 2.5, 3.5, 4.5 and 5.5**, plus other legitimate registered lines; handle integer/quarter lines correctly. |
| Team goals | Each team's supported totals, scoring yes/no and clean-sheet markets. |
| BTTS / goal-goal | Yes/no at full time and supported half-specific variants. |
| Correct score/ranges | Full-time and supported half scores; exact totals and registered bands such as 1–2, 1–3 or 1–4. |
| Half relationships | Highest-scoring half including equal; half-time/full-time outcomes; supported scoring-in-both-halves variants. |
| Combined outcomes | Result/double chance with goals, BTTS with totals, and other mapped combinations using their joint probability. |
| Players | Anytime/first/last scorer, player goal totals, assists, shots or bookings only with suitable models and participation evidence. |
| Discipline/set pieces | Team/match corners, cards, red cards and relevant handicaps/periods where supported. |
| Other catalog markets | Register, map and evaluate with an appropriate model or give an explicit unsupported reason. |

### Meaningful market definitions

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 334.*

Never fabricate unrealistic new goal lines solely to obtain near-100% recommendations. Legitimate registered markets can be predicted without current bookmaker odds, but must have clear, meaningful settlement definitions.

## Scope boundary

This is a data-contract task placed before its consumers. Do not implement forecasting, fabricate high-probability lines or expand live forecasting beyond the approved scope.

## Acceptance checks

- [ ] Define period, selection set, parameterized lines/player/team, settlement rules, evidence needs, capability, source mappings and display name for every registry entry.
- [ ] Represent all requested families, including explicit unsupported/unmapped states, without claiming models already exist.
- [ ] Make the registry shared and versioned while keeping fixture-specific applicability, players, lines and odds separate.
- [ ] Record any unavailable market file instead of guessing its contents; leave provider-catalog reconciliation hooks for task 024.

## Handoff

Return actual changed files/artifacts, check commands and results, configuration or migration changes, and any evidence-backed deviations or blockers. Do not claim unverified outcomes.

Next in sequence: [006 — Implement durable job ownership and overlap protection](006-durable-job-control.md).
