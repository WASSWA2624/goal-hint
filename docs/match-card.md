# Shared match-card presentation

Prompt [018](../dev-plan/018-match-card.md) supplies reusable presentation for
the later feed and detail pages. Components receive visitor-facing props; they
do not fetch providers, start polling, access Redux or persist data. Examples
exist only in tests and isolated acceptance apps.

## Components and composition

Import directly from the owning module under `@/components/match`:

| Module | Public contract |
| --- | --- |
| `match-card` | `MatchCard`, `MatchCardProps`: validated `fixture`, required canonical `analysisSlug`, optional `selectedFamily` (default `match-result`), locale, heading level 2–4 (default 2), `eagerLogos` (default false) and an optional one-based `position` for the desktop `#` column. Memoized: `sameCardFixture` (domain `match-card`) treats an equal-version record as unchanged unless a field `mergeFixtureObservation` refreshes differs; `markets` compares by content and every other prop by identity. Team names, codes and logos (and the competition's logo) are not compared: a catalog change bumps the version of every fixture that renders it. The competition's `countryFlagUrl` is compared by value, because a flag change alone does not bump the version. |
| `team-row` | `TeamRow`, `TeamRowProps`: public team, Home/Away side, nullable score, locale and optional eager logo loading, used by the detail page. `TeamLogo` is shared with the card; containers size it with `--gh-logo-size` (default 32px) and may place it by its `data-team-logo` attribute. Names remain visible when a logo fails. |
| `probability-label` | `ProbabilityLabel`, `ProbabilityLabelProps`: a complete `AcceptedMarket`, optional selection within that market, and locale. Displays an estimated probability using domain group rounding. |
| `outcome-badge` | `OutcomeBadge`, `OutcomeBadgeProps`: one canonical settlement outcome status and locale. Explicit text plus the shared decorative icon; no live-region announcements for static cards. |
| `match-card-list` | `MatchCardList`: native list with caller-supplied `li` children and an optional locale. One column of tiles below `lg` (64rem) and an aligned table with a decorative navy column header from `lg`. Source order remains visual and keyboard order. |
| `match-icons` | Decorative inline SVG icons (`aria-hidden`, not focusable). |
| Domain `country-code` | `countryCode`: the competition country's three-letter code on the phone tile's meta line (below). Domain `team-name` keeps only `teamCodePattern` and `validTeamCode` for stored provider team codes, which cards never display. |

Desktop presentation retains its compact table composition:

1. Header: competition (and country), compact EAT kickoff day and time in one
   `time` element whose title carries the full EAT instant.
2. Teams: logos and names either side of a centre state. Scheduled shows `VS`;
   live shows the score and a red chip with the provider minute (`67′`) or
   phase (`HT`, `Break`, `Penalties`…); finished shows the score with `FT`,
   `AET*` or `Pens*` (the asterisk marks a 90-minute score, explained in the
   chip title and hidden text); postponed/canceled/abandoned/awarded show a
   neutral status chip.
3. Pick: the market family, the selection and the estimated percent. On
   desktop the family is a tag washed from the family tint into white, with a
   1px family ring, a solid 3px family edge and bold family-coloured text
   (inset shadows draw the ring and edge, so rows keep their height); the
   short pick sits in a pill in the family's gradient. Phone and tablet cards
   show market code, pick and probability chips instead (below). A padlock replaces
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

### Phone and tablet tile (below 64rem)

The mobile card has exactly four visible rows; the desktop retains its existing table columns:

1. Match date and 24-hour kickoff time with visible EAT zone together on the left; a color-coded match status badge on the right.
2. Country flag and FIFA code on the left; one-line, ellipsized league name and competition logo on the right, with the logo at the outer edge.
3. Single-line home name and crest, centered score above VS with live minutes below, away crest and single-line name.
4. Four compact cells: market code, full selection label, estimated probability and outcome. No heading row.

All screen sizes show 24-hour kickoff times with the EAT label and country flags/codes. Within the existing desktop league column, country metadata sits above the league name and logo to keep both readable without adding table columns.

Cards use 4px vertical/8px horizontal padding, 2px internal row gaps, 8px page gutters and 6px list gaps. Metadata and team names are 12px, scores 14px and prediction cells have a 24px minimum height. Cards remain about 101px, or 113px with a live clock. Long names ellipsize on one line; wrapping prediction/result labels may grow naturally. The existing variable Manrope font uses a lighter 350 weight for mobile team names and regular prediction labels. Crisp borders and 6px corners separate the white cards from the blue-gray feed background without shadows. Desktop typography remains unchanged. Text is in rem; card/cell heights are never fixed.

Blue prediction cells and neutral/green/red result cells follow the mobile reference. `correct` is presented as Won (✓), `incorrect` as Lost (✕), and pending as Pending (–). Void retains its label; unavailable displays a dash, with the full missing-prediction reason retained in accessible text. Only supplied, correctly bound final settlements can show Won/Lost. Scheduled matches show VS without an invented score. Running clocks include available `stoppageMinutes`; paused phases retain their phase label. Top-row badges show blue Upcoming, red Live and teal Ended; postponed, canceled, abandoned, awarded and paused live states retain their actual labels instead of being grouped into an inaccurate status.

Local MIT-licensed SVG flags in `public/flags` resolve recognized football countries, including England, Scotland, Wales and Northern Ireland, and work without a remote image request. A safe supplied provider flag is a secondary fallback. Unknown countries never borrow another country's flag from a derived abbreviation; international fixtures retain a globe. League/team images keep the existing URL safety and loading fallback behavior.

The same full-card link, canonical navigation, hidden full team names, score/outcome descriptions and supplied notes remain accessible. Notes occupy no fifth visible mobile row and are linked with `aria-describedby`; desktop notices remain visible. Public odds for the selected pick stay in the prediction tooltip and accessible text, without adding a fifth prediction cell. Long team names ellipsize on one line with full names in the heading/link and a hover tooltip. League names truncate first.

Browser acceptance covers 320, 360, 390 and 430px, 200% root text, long names, scheduled/live/final states, local flags, four visible rows and no page/card horizontal overflow. Date controls stack at narrow effective container widths to preserve readable labels with enlarged text.

**Team codes.** Fixture snapshot teams still carry an optional provider `code`
(`fixture-snapshot.ts`; the feed and detail read publishes
`validTeamCode(FootballTeam.code)`), stored by the spare-quota team-code import
([football catalog](football-catalog.md#team-codes-spare-quota-import)). Cards
do not display it, following the owner's decision for full names.

Use the existing root style provider. The desktop table uses `theme.border.cardRadius`,
`theme.shadow.card` and the per-family `theme.color.market` hues (match result
emerald `#00824A`, double chance violet `#7C3AED`, total goals blue `#2563EB`,
BTTS orange `#C2410C`; clean tints share one lightness). Match result uses the
lightest, most vivid emerald that still holds white text, and its gradient
turns toward fresh green (`#00824A` to `#07802F`) instead of fading into the
brand teal. Market colours use the `MarketColors` type, which is stricter than
`AccentColors`: white keeps 4.5:1 on every solid and on both gradient stops, and
each family's text colour keeps 4.5:1 on its tint and on white, so all of them
can carry small text. `tests/market-colors.test.mjs` computes these ratios for
every family. Long names and words wrap inside bounded
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
its `--gh-logo-size` square before loading (20px on phone tiles, 22px in table rows; country flags are 16×11 on tiles). Default loading is lazy; callers may explicitly opt into eager loading
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
node --conditions=react-server --test tests/team-name.test.mjs tests/country-code.test.mjs
npm run test:card:rendering
npm run test:card:rendering -- --serve
npm run check
```

The domain/state contract tests cover family independence, supplied
outcomes, binding/validation, all sources/notices, boundary/group rounding,
Unicode initials, structural URL checks, actual EAT times and atomic version
replacement. Additional checks cover market labels, no-pick descriptions,
full team identity and single-line name truncation. Browser checks verify the
four-row geometry and natural height growth with enlarged text.
`tests/team-name.test.mjs` covers
provider code validation against the stored pattern; `tests/country-code.test.mjs`
covers the photo's countries, provider spellings and variants, distinct codes
for every stored country and the derived fallback. The rendering script builds a separate production Next app under
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
