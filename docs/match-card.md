# Shared match-card presentation

Prompt [018](../dev-plan/018-match-card.md) supplies reusable presentation for
the later feed and detail pages. Components receive visitor-facing props; they
do not fetch providers, start polling, access Redux or persist data. Examples
exist only in tests and isolated acceptance apps.

## Components and composition

Import directly from the owning module under `@/components/match`:

| Module | Public contract |
| --- | --- |
| `match-card` | `MatchCard`, `MatchCardProps`: validated `fixture`, required canonical `analysisSlug`, optional `selectedFamily` (default `match-result`), locale, heading level 2–4 (default 2), `eagerLogos` (default false) and an optional one-based `position` for the desktop `#` column. Memoized: `sameCardFixture` (domain `match-card`) treats an equal-version record as unchanged unless a field `mergeFixtureObservation` refreshes differs; `markets` compares by content and every other prop by identity. Team names, codes and logos are not compared: a catalog change to a shared team bumps the version of every fixture that renders it. |
| `team-row` | `TeamRow`, `TeamRowProps`: public team, Home/Away side, nullable score, locale and optional eager logo loading, used by the detail page. `TeamLogo` is shared with the card; containers size it with `--gh-logo-size` (default 32px). Names remain visible when a logo fails. |
| `probability-label` | `ProbabilityLabel`, `ProbabilityLabelProps`: a complete `AcceptedMarket`, optional selection within that market, and locale. Displays an estimated probability using domain group rounding. |
| `outcome-badge` | `OutcomeBadge`, `OutcomeBadgeProps`: one canonical settlement outcome status and locale. Explicit text plus the shared decorative icon; no live-region announcements for static cards. |
| `match-card-list` | `MatchCardList`: native list with caller-supplied `li` children and an optional locale. One column of tiles below `lg` (64rem) and an aligned table with a decorative navy column header from `lg`. Source order remains visual and keyboard order. |
| `match-icons` | Decorative inline SVG icons (`aria-hidden`, not focusable). |
| `short-team-name` | `ShortTeamName`, `ShortTeamNameProps`: a team `name`, an optional provider `code` (2–5 letters or digits; the card passes the fixture team's `code`, or `null` when the team has none) and a `className`. Renders the full name (always on the server); in a single-line box that overflows it swaps to the code, else the shortened name from domain `team-name`, and finally truncates with an ellipsis. The full name stays in visually hidden text and the tooltip whenever another form shows. Used only by the phone tile; a wrapping box (the desktop table) keeps the full name. |

The card is deliberately visual and terse. It shows four bands:

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

The same DOM becomes a white row card in the shape of the owner's reference:
league on the left, the stacked teams in the middle, the pick chips and a
chevron on the right. Home and away keep their own lines, each with crest, name
and score. Every match state, including every no-pick reason, is 62px tall (1
border + 8 padding + 44 teams track + 8 padding + 1 border) from 22.5rem
(360px). Two cases are taller on purpose: notes add a row underneath (about
20px) only when present, because they carry delays and coverage gaps, and
narrow phones (below 22.5rem) are 80px (below). A missing kickoff time
("Kickoff unavailable") wraps to a second line and adds 14px.
Line boxes are in rem, so 200% text scales the spacing with the type, and the
variants below are rem media queries, so enlarged text reaches them on wider
phones too.

- Surface: `theme.color.surface`, a hairline `theme.color.border` border, a
  10px radius (rounded corners are an explicit owner request for phone and
  tablet cards only; the desktop table and other components stay square), a
  soft two-layer shadow that lifts on hover only where `(hover: hover)`, and an
  immediate 8% navy press tint on the full-card link, clipped to the radius. No
  market edge.
- Meta column (5.5rem; 4.5rem on 360–389px phones): the league crest (18px; a
  missing crest becomes a soft disc around the trophy) spans the league name
  (11px semibold navy, up to two lines, hyphenating a long word before the
  clamp) and the kickoff line, the short EAT weekday and the time in bold
  (`Sun 21:00`, 11px muted). The weekday stays because date ranges list several
  days. On 360–389px phones the kickoff line (up to 58px, `Wed 21:00`) runs
  under the crest instead, which leaves the league name 50px and the team names
  16px more. The `time`
  element keeps its full title and its hidden text (full day, time and EAT).
  Live, finished and halted matches show a decorative chip in the kickoff
  line's place: red with the minute or phase (the dot pulses only while play
  runs, not at half-time, break, interruption or suspension), outlined `FT`,
  `AET*` or `Pens*`, or amber `Postponed`, `Canceled`, `Abandoned`, `Awarded`.
  The kickoff then stays in hidden text, and the score-line block (hidden on
  tiles) still announces the state.
- Teams column (up to 24rem): 18px crests (initials, 10px, fall back to a
  ringed disc via `--gh-logo-radius` and `--gh-logo-ring`), the fitted name
  (13px semibold, `ShortTeamName`) and the score at the right (14px heavy, red
  while live). After a decided final the winner's name turns bold and the
  loser's name and score are muted; a level score, or a 90-minute score shown
  for an extra-time or penalties finish, marks neither side.
- Pick chips (5.625rem, two 20px rows aligned with the team rows): the market
  code (`market.code.*`: 1X2, DC, O/U 2.5, BTTS; grey) and the short pick
  (`market.pick.*`: 1, X, 2, 1X, X2, 12, Over, Under, Yes, No; the family's
  clean tint and text colour) on the first row; the probability (12px heavy)
  across the second. Pending keeps the family tint with a 40% family ring and
  leads with the padlock once locked; Correct, Incorrect and Void take the
  outcome's green, red or grey tint and lead with ✓, ✗ or ⊘. Without a pick the
  pick chip is a muted outlined `—` and the full reason (10px muted, up to two
  13px lines) takes the probability's place. Every reason fits two lines (the
  widest line, "Predictions start", needs 80.4px), and a negative block margin
  lets the 26px of text sit in the 20px row, spilling 3px into the row gap and
  the card padding, so the card keeps its height and the cap tops still clear
  the chips by 5px. The widest pair, `O/U 2.5` + `Under`,
  needs 87.5px. From 30rem the three chips share one line in a 9.5rem block,
  the probability in a fixed 3.75rem column so it aligns across cards.
- Chevron: decorative, in the card's right padding, centred on the team rows.

Column budget (Manrope advance widths, kerning ignored). The name box is the
teams track minus the crest and its gap (24px), and minus the score and its
gap (18px; one tabular digit is 8.7px) when scores show. "Full fit" is the
share of the 5,251 stored team names whose full name fits at 13px semibold:

| Viewport | Card | Content | Meta | Teams | Chips | Name box with / without scores | Full fit |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 320px (narrow) | 288 | 260 | 14px line on top | 164 | 90 | 122 / 140 | 93% / 98% |
| 360px (compact) | 328 | 300 | 72 | 126 | 90 | 84 / 102 | 60% / 79% |
| 375px (compact) | 343 | 315 | 72 | 141 | 90 | 99 / 117 | 76% / 90% |
| 390px | 358 | 330 | 88 | 140 | 90 | 98 / 116 | 75% / 90% |
| 430px | 398 | 370 | 88 | 180 | 90 | 138 / 156 | 97% / 99% |

Content is the card minus the 1px borders and 8px left / 18px right padding;
the teams track gets what the meta, the two 6px gaps and the chips (90) leave.
Names that do not fit swap to the team's code when it has one (a 2–5 letter
code always fits). Teams without a code shorten (16–50 of the stored names at
360–390px, depending on the box) or end in an ellipsis. Below 22.5rem (320px phones) the crest, league name (one line) and
kickoff or state chip share a 14px line above the teams and chips (80px tall).
That costs 18px of height but keeps the names readable: three columns with a
time-only 4rem meta column would leave a 52px name box beside a score (21% of
names fit) and 70px without (44%).
Below 20rem, reached only with enlarged text (125% or more on a 360px phone),
the chips drop under the teams on one line. Card text is 10px or larger and
every text colour keeps 4.5:1 on its fill, including under the hover tint and
the press tint (code chip 5.2:1, muted text 5.5:1 on the hover row, family text
5.4:1 or better on its tint under the press tint).

#### Team names in tight spots

`ShortTeamName` tries `teamDisplayCandidates(name, code)` from domain
`team-name` in order: the full name, the code (when it is 2–5 letters or
digits), then `shortTeamName(name)` when it differs; if none fits, the last one
truncates with an ellipsis. A code therefore replaces a name only when the full
name would not fit, and a team without a code falls back to the shortened name
and then the ellipsis. Shortening is minimal and documented in the module: it only swaps in forms fans already read as the same
club (Man Utd, Man City, Leeds Utd, Wigan Ath, St Mirren, St-Étienne) and never
drops a word, then the ellipsis takes over. Club tokens (FC, CF, SC, CD, AFC,
FK) always stay, because what remains is often a city, a country, another
stored club's name or an adjective ("Andorra CF", "Hong Kong FC",
"Internacional SC", "CD Olimpia", "Chemnitzer FC"); prefixes (AC Milan, AS
Roma) and qualifiers (II, B, U21, W, Women, Reserves) are never touched. 118 of
the stored names have a shorter form, and none of them equals another stored
team's name or another team's short form.

**Where codes come from.** Fixture snapshot teams carry an optional `code`
(`fixture-snapshot.ts`; 2–5 capital letters or digits, or null). The feed and
detail read (`storedFeedFixture`) publish `validTeamCode(FootballTeam.code)`:
trimmed, ASCII letters and digits only, uppercased, else null. The feed and
detail cache projections moved to 7 and 5, and payloads cached without `code`
still parse. `MatchCard` passes `team.code ?? null` for both teams, and
`ShortTeamName` checks the code again before using it. Codes are stored by
the spare-quota team-code import
([football catalog](football-catalog.md#team-codes-spare-quota-import)). It is
off on Free and slow plans, so until a team's league is imported (and always
for clubs the provider never codes) the card uses the shortened name, then the
ellipsis.

Fitting measures without layout reads in loops: one module-level
`ResizeObserver` reports each name box's content width, and one animation-frame
batch reads computed fonts, measures candidates on a shared canvas (cached per
font and text, cleared when web fonts load) and then applies all results. Each
name holds its choice in local state, so a swap re-renders only that name, never
the memoized card. Only a single-line (`white-space: nowrap`) box swaps; the
table's wrapping names always stay full. The name box must not size to its text
(the tile's `flex: 1 1 0` does not).

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
its `--gh-logo-size` square before loading (18px on phone tiles, 22px in table rows). Default loading is lazy; callers may explicitly opt into eager loading
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
node --conditions=react-server --test tests/team-name.test.mjs
npm run test:card:rendering
npm run test:card:rendering -- --serve
npm run check
```

The nine domain/state contract tests cover family independence, supplied
outcomes, binding/validation, all sources/notices, boundary/group rounding,
Unicode initials, structural URL checks, actual EAT times and atomic version
replacement; a further test keeps a short market code and pick for every family
and selection, which the phone chips need. `tests/team-name.test.mjs` covers
the shortening rules, real club names that must keep their club token, kept
prefixes and qualifiers, code validation and the candidate order. The rendering script builds a separate production Next app under
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
