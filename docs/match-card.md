# Shared match-card presentation

Prompt [018](../dev-plan/018-match-card.md) supplies reusable presentation for
the later feed and detail pages. Components receive visitor-facing props; they
do not fetch providers, start polling, access Redux or persist data. Examples
exist only in tests and isolated acceptance apps.

## Components and composition

Import directly from the owning module under `@/components/match`:

| Module | Public contract |
| --- | --- |
| `match-card` | `MatchCard`, `MatchCardProps`: validated `fixture`, required canonical `analysisSlug`, optional `selectedFamily` (default `match-result`), locale, heading level 2–4 (default 2), `eagerLogos` (default false) and an optional one-based `position` for the desktop `#` column. Memoized: `sameCardFixture` (domain `match-card`) treats an equal-version record as unchanged unless a field `mergeFixtureObservation` refreshes differs; `markets` compares by content and every other prop by identity. |
| `team-row` | `TeamRow`, `TeamRowProps`: public team, Home/Away side, nullable score, locale and optional eager logo loading, used by the detail page. `TeamLogo` is shared with the card; containers size it with `--gh-logo-size` (default 32px). Names remain visible when a logo fails. |
| `probability-label` | `ProbabilityLabel`, `ProbabilityLabelProps`: a complete `AcceptedMarket`, optional selection within that market, and locale. Displays an estimated probability using domain group rounding. |
| `outcome-badge` | `OutcomeBadge`, `OutcomeBadgeProps`: one canonical settlement outcome status and locale. Explicit text plus the shared decorative icon; no live-region announcements for static cards. |
| `match-card-list` | `MatchCardList`: native list with caller-supplied `li` children and an optional locale. One column below `md` (48rem), two from `md`, and an aligned table with a decorative navy column header from `lg` (64rem). Source order remains visual and keyboard order. |
| `match-icons` | Decorative inline SVG icons (`aria-hidden`, not focusable). |

The card is deliberately visual and terse. It shows four bands:

1. Header: competition (and country), compact EAT kickoff day and time in one
   `time` element whose title carries the full EAT instant.
2. Teams: logos and names either side of a centre state. Scheduled shows `VS`;
   live shows the score and a red chip with the provider minute (`67′`) or
   phase (`HT`, `Break`, `Penalties`…); finished shows the score with `FT`,
   `AET*` or `Pens*` (the asterisk marks a 90-minute score, explained in the
   chip title and hidden text); postponed/canceled/abandoned/awarded show a
   neutral status chip.
3. Pick: a soft market chip (code and family name) and a solid pill in the
   family's colour with the selection and estimated percent. A padlock replaces
   the bar icon once the prediction is locked. Correct, Incorrect and Void add a
   round ✓/✗/⊘ mark with a tooltip and hidden text. Missing families show
   No pick.
4. Notes, only when supplied: updating, update delayed, result delayed, limited
   news, partial coverage, no locked selection, void reasons and outside-window
   availability.

Source, provisional status and publication time move to the pill tooltip; sync
time stays on the detail page. On desktop each card becomes one table row
using `match-columns.ts` tracks and CSS subgrid: #, time, league, home, score,
away, market, prediction and a chevron.

Use the existing root style provider. Cards use `theme.border.cardRadius`,
`theme.shadow.card` and the per-family `theme.color.market` hues (match result
green, double chance purple, total goals blue, BTTS orange; every solid fill
keeps white text at 4.5:1 or better). Long names and words wrap inside bounded
grid tracks. The analysis link uses `matchHref`, canonical fixture identity and
the supplied slug, with prefetch disabled. It covers the whole card, so the
entire card or row is the click target. The eventual detail route owns identity
lookup and slug canonicalization.

The article's accessible heading names both teams and can match the page's
heading hierarchy. Reading order is competition/kickoff, Home, match state,
Away, selected market prediction with estimated probability and outcome,
supplied notices, then View analysis. Decorative visual text (score digits,
`VS`, short picks, percent, column headers) is `aria-hidden`; hidden text
announces the score line, live phase and minute, and prediction in full. Each
card has one keyboard destination, with a contextual accessible link name and
shared visible focus. Missing scores are announced as unavailable.

## Versioned public data

`parseFixtureSnapshot` validates the shared [state handoff](client-state.md).
018 adds optional fields without changing older valid snapshots:

| Location | Field and meaning |
| --- | --- |
| Team | `logoUrl?: string | null`, a server-approved remote HTTPS catalog URL. |
| Fixture | `partialCoverage?: boolean`, a supplied fixture coverage notice. |
| Forecast | `updateDelayed?: boolean`, an actual delayed-update flag; `provisional?: boolean`, defaulting to true in presentation. |
| Each forecast market | `limitedNews?: boolean` and optional `outcome`. |
| Outcome | `cycleId`, `revisionId`, `selection`, canonical `status`, and nullable public `explanation`. Void requires a nonempty explanation. |
| Fixture | `liveClock?: { phase, minute } | null`, present only while `status` is `live`. Phases: first-half, half-time, second-half, extra-time, break, penalties, interrupted, suspended, in-play. `minute` is the provider elapsed minute for running phases and null while play is paused. |

These fields are part of the entire versioned fixture snapshot. A newer version
replaces them together with score/status/forecast; equal or older versions
cannot patch a logo, notice or outcome into the accepted record.

An outcome must match the fixture cycle, forecast revision and that market's
deterministic selection. Correct/Incorrect additionally requires a played final
fixture status. The public server projection must choose the appropriate
published or locked revision and attach only that revision's settled outcomes.
It must never splice a historical locked result into a different forecast.
Explanations must be visitor-safe copy, not internal logs or provider payloads.

`selectedCardPrediction` reads only the selected family. No forecast or missing
family produces Unavailable and no probability, source or invented publication
time. A valid supplied prediction without a matching outcome remains Pending.
The UI does not adjudicate scores. A final fixture can therefore display its
known final score alongside Pending or Unavailable prediction correctness.
The score remains an overall display value, not a verified regulation score;
the settlement domain/server owns regulation-time decisions.

The server projection derives `liveClock` from the sealed, coherent
`FixtureResult` version (`providerStatus` and `elapsedMinutes`) with
`liveClockFromProvider`. A changed minute creates a new result and fixture data
version, so the card's minute advances with the existing live-refresh cadence;
the browser does not extrapolate the clock between refreshes.

## Probabilities, source and notices

`probabilityEntry` calls `presentMarketProbabilities` on the complete accepted
market. It preserves deterministic selections and largest-remainder rounding
for complementary groups (for example 34/33/33), while double-chance values
remain independently rounded. Boundary labels are Less than 1% and More than
99%, never misleading 0% or 100%. A foreign selection or invalid group fails
validation. Switching families switches the pick, probability, source and
outcome together; correctness never colors unrelated markets or the whole card.

Correct and Incorrect use their existing green/red outcome tones and Void uses
gray, each with a distinct non-color icon, a tooltip and hidden explicit text.
Pending and Unavailable add no mark; their status remains in hidden text and
`data-outcome`. Fixture status and score remain separate from prediction outcome.

Source comes from the selected market (AI prediction or API-Football fallback).
The card's pill tooltip names the source and the actual forecast `publishedAt`
as a full Gregorian EAT date/time label; the detail page keeps the visible
publication `time`. Kickoff uses the same shared calendar
validation and explicit Kampala time zone. Browser locale/time zone and the
current clock cannot change the supplied instant. Formatting caches contain
only immutable `Intl` formatters, never visitor data.

The pill tooltip says Provisional estimate unless trusted server data
qualifies the forecast otherwise. Presentation makes no calibration claim. Update delayed is a
forecast-wide supplied fact, Limited news coverage is selected-market-specific,
and Partial coverage is fixture-wide. Missing notices do not imply full coverage.

Prompt 032 also presents the optional stored cycle/update metadata: locked
prediction (padlock and hidden text), no locked selection for the selected
family, an in-progress prediction refresh, outside-window availability and
delayed result updates. `syncedAt` is shown on the detail page, not the card. The card does not select another revision
or change timestamps. Feed and detail links share `domain/match-slug.ts`.

## Remote logos and fallbacks

`isSafeRemoteImageUrl` is shared with catalog import, provider normalization and
trial evaluation. It requires a bounded HTTPS URL without credentials, query,
fragment, whitespace, controls or backslashes. This structural check does not
grant media rights: the server catalog/provider approval still decides which
exact URLs may be projected to visitors.

Logos use native `styled.img` with the exact supplied URL, empty alt text,
32px width/height attributes and `object-fit: contain`. The container reserves
its `--gh-logo-size` square before loading (44px on cards, 28px in table rows). Default loading is lazy; callers may explicitly opt into eager loading
for known above-the-fold cards. Requests use `no-referrer`. There is no Next
optimizer, server proxy, binary download, image database column or asset copy.

Initials are derived from Unicode team names and remain beneath the image until
it loads. Cached images that finish before hydration are recognized through the
ref. Missing or failed URLs retain initials; a failed image is removed without
repeated retries. Changing the team/URL resets that image state and permits the
replacement to load. Without JavaScript, the stable server initials remain
visible. Logo and initials containers are decorative and hidden from assistive
technology; full team names provide identity throughout.

## Verification

```text
npm run test:card
npm run test:card:rendering
npm run test:card:rendering -- --serve
npm run check
```

The nine domain/state contract tests cover family independence, supplied
outcomes, binding/validation, all sources/notices, boundary/group rounding,
Unicode initials, structural URL checks, actual EAT times and atomic version
replacement. The rendering script builds a separate production Next app under
`.tmp/match-card-*` using the real root layout and shared components. Twelve
labeled synthetic examples include every outcome, both sources, missing/broken
logos, delayed/limited/partial coverage, unknown fields and long names. An
isolated analysis destination exists solely for keyboard acceptance.

Playwright CLI acceptance checks initial server DOM before releasing JavaScript,
cached image hydration, market switching, every link's tab order/focus, Enter
activation, direct image requests, 404/429 and replacement URLs, all five
viewport widths (320, 360, 390, 430 and 1280px), 200% text at 320px, and a
JavaScript-disabled context. Synthetic HTTPS image requests are intercepted
with local test responses; this verifies browser transport/fallback behavior,
not real-provider CDN reliability or media rights. Browser artifacts remain
under ignored `output/playwright/`. Actual results are recorded in
[development progress](development-progress.md).
