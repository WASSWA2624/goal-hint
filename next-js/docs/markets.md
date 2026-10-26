# Regulation-time market contract

`src/domain/markets.ts` owns validation, selection and probability presentation;
`src/domain/market-settlement.ts` owns pure adjudication. Both are browser-safe
and independent of providers, storage and current time. All four families use
regulation time including stoppage time, excluding extra time and penalties.
Exact-score markets remain excluded.

## Versions and stable codes

The validation/settlement rule version is `regulation-markets-v1`; presentation
is independently tagged `probability-display-v1`. Store the market rule version
with future predictions/settlements and retain the selected unrounded probability.
Changing tolerances or conflict semantics requires a recorded new version.

| Family | Selection codes in exact-tie order |
| --- | --- |
| `match-result` | `home-win`, `draw`, `away-win` |
| `double-chance` | `home-or-draw`, `away-or-draw`, `home-or-away` |
| `total-goals` | `over-2.5`, `under-2.5` |
| `both-teams-to-score` | `yes`, `no` |

Codes and reason/label keys are language-neutral. UI owners translate them;
probability labels must render **Estimated probability**, and the boundary keys
must render **Less than 1%** and **More than 99%**.

## Candidate validation and numeric policy

The user approved a group-sum tolerance of **0.001** (0.1 percentage points) and a
consistency tolerance of **0.002** (0.2 percentage points) for this version.
Tolerance equality is accepted. Runtime defaults use these shared limits, and
differing environment overrides fail rather than change the version's behavior.
These choices do not establish provider precision, calibration or operating rights.

`validateMarketGroup(family, candidate)` accepts one complete source group:

```ts
const candidate = {
  source: "ai", // Or "api-football"; one source supplies the entire group.
  period: "regulation-including-stoppage-time",
  probabilities: { "home-win": 0.45, draw: 0.3, "away-win": 0.25 },
};
```

These are illustrative synthetic probabilities. A total-goals candidate also
requires numeric `line: 2.5`. Each exclusive distribution must contain exactly
its listed alternatives; each probability must be a finite number strictly
between zero and one, and `abs(sum - 1) <= 0.001`. Missing values, numeric strings,
odds, confidence-only payloads, extra alternatives and unsupported periods/lines
are rejected. No input is silently repaired, complemented or normalized.

Comparison and derivation use exact decimal arithmetic over each JavaScript
number's canonical string representation. No additional floating-point epsilon
widens an approved tolerance. Original numeric values are copied unchanged into
frozen distributions. This is a number-valued domain contract, not support for
arbitrary decimal-string inputs; persistence owners still choose exact database
precision/scale from validated provider/model contracts.

Match result and double chance are atomic: one accepted result group derives
`H+D`, `A+D`, and `H+A`, retaining the same source and rule version. Direct
double-chance candidates are rejected. Overlapping alternatives are not required
to total one, and they are not normalized. If any derived value cannot be
represented strictly inside `(0, 1)`, reject the entire result source group.

`chooseMarketSelection` uses the highest unrounded input; exact ties use the table
order. The selected pick is independent of presentation rounding. Validation
returns `valid: false` with a stable reason rather than manufacturing a group.

## Cross-market consistency and conflict handling

`checkMarketConsistency` checks complete accepted match-result, total-goals and
BTTS marginals. Let `D = P(draw)`, `O = P(over 2.5)`, and `B = P(BTTS Yes)`:

- `B <= D + O + 0.002`: BTTS with under 2.5 can only be a 1–1 draw.
- `D + O <= 1 + B + 0.002`: a draw with over 2.5 requires both teams to score.

These checks require all three source groups. They do not invent a joint score
distribution or assert that BTTS must be less likely than over 2.5. Every pair
alone can describe a possible regulation result. Passing the checks establishes
compatibility, not forecast accuracy or evidence sufficiency.

`validateMarketSnapshot` receives at most one candidate per independent source
group, keyed by `match-result`, `total-goals` and `both-teams-to-score`. It returns
all four families explicitly available/unavailable, a frozen policy/version and
auditable issues. Unsupported supplied families produce issues and no forecast.
Input property order never changes selection or conflict decisions.

For a three-group conflict, omit **all participating fallback groups**, preserving
the valid AI subset. If all participants have one source, omit every conflicting
participant; none receives an arbitrary family preference. Dropping match result
also drops derived double chance. Issues retain related groups and violated
constraints. Missing groups stay unavailable, and no old snapshot is merged.
Provider fetching, retry/fallback attempts, fixture/cycle identity, provenance,
freshness and retention belong to prompts 007–013/019–025.

## Probability presentation

`presentMarketProbabilities(acceptedMarket)` returns frozen entries with original
probability, whole `roundedPercent`, selection and label keys. It rechecks the
version, family, probabilities, chosen pick, selected probability, source, period
and required line/derivation metadata so inconsistent deserialized input fails.
A persisted double-chance group must still be validated against its source result
group by the loading/publication service.

Exclusive groups allocate 100 integer percentage points by largest remainders:
derive display-only quotas from the accepted group's total, floor them, then
assign remaining points by largest fractional remainder and specification tie
order. Equal three-way probabilities display `34 / 33 / 33`. This permitted
presentation allocation changes no stored probability or selected pick.
Double-chance percentages round independently; their displayed total commonly
approximates 200%.

Allocated 0 and 100 carry boundary-label keys, never certainty claims; other
entries use `probability.percent`. Every presentation carries
`probability.estimated`. Model verbal confidence, evidence completeness and
source freshness remain separate concepts.

## Result adjudication

`settleMarketSelection(family, selection, context)` returns a frozen
`{ ruleVersion, status, reason }`. It settles one previously chosen pick; it does
not lock it or inspect probabilities to choose another pick.

The context requires normalized fixture `status`, explicit `cycleEligibility`
and a separate `regulationScore`. A verified score declares literal `verified:
true`, the exact regulation period, and nonnegative safe-integer home/away goals
with a safe total. Provider adapters own verification and status normalization.

| Priority | Outcome |
| --- | --- |
| Missing/unsupported selection or family | `unavailable`, including excluded exact scores. |
| Explicitly ineligible cycle, postponed/canceled/abandoned/awarded fixture | `void`, with the supplied stable eligibility/fixture reason. |
| Live, scheduled, unknown status or invalid context | `pending`; a live score never settles a pick. |
| Final status without a valid separately verified regulation score | `pending`, with missing/unverified/invalid-score reason. |
| Eligible final with verified regulation score | `correct` or `incorrect`, independently for each family's pick. |

Final statuses cover regulation, extra time and penalties. The last two still
require the separate regulation score; final and shootout totals are never used
as a substitute. Under 2.5 accepts at most two regulation goals; Over 2.5 requires
at least three. BTTS Yes requires both teams to score, and No requires at least
one zero. All double-chance alternatives are adjudicated from the same result.

Prompts 019/023/024/027 own immutable locks, cycle lifecycle, result verification,
correction history and idempotent persistence. Headline aggregation is later work;
only correct/incorrect enter its denominator, and alternatives/superseded picks
must not multiply forecasts. No provider support, live integration, calibration,
publication or database migration is claimed by this domain foundation.
