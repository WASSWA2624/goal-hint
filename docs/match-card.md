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
| `team-row` | `TeamRow`, `TeamRowProps`: public team, Home/Away side, nullable score, locale and optional eager logo loading, used by the detail page. `TeamLogo` is shared with the card; containers size it with `--gh-logo-size` (default 32px) and may place it by its `data-team-logo` attribute. Names remain visible when a logo fails. |
| `probability-label` | `ProbabilityLabel`, `ProbabilityLabelProps`: a complete `AcceptedMarket`, optional selection within that market, and locale. Displays an estimated probability using domain group rounding. |
| `outcome-badge` | `OutcomeBadge`, `OutcomeBadgeProps`: one canonical settlement outcome status and locale. Explicit text plus the shared decorative icon; no live-region announcements for static cards. |
| `match-card-list` | `MatchCardList`: native list with caller-supplied `li` children and an optional locale. One column of tiles below `lg` (64rem) and an aligned table with a decorative navy column header from `lg`. Source order remains visual and keyboard order. |
| `match-icons` | Decorative inline SVG icons (`aria-hidden`, not focusable). |
| Domain `team-name`, `country-code` | `teamAbbreviation`, `cardTeamAbbreviations`, `validTeamCode` and the label width helpers; `countryCode`. Used by the phone tile (below). |

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

The same DOM becomes one white rounded row in the shape of the owner's
reference photo (match cards only), with the owner's four exceptions: team
crests sit against the score, the home label is right-aligned, the kickoff time
follows the country under the league name, and team names are always
abbreviated.

```text
[crest] Premier League │ ARS [crest] vs [crest] LIV │ [1X2] [1] [62%] [2.10]? ›
        ENG · 13:30    │
```

- Surface: `theme.color.surface`, a hairline `theme.color.border` border, a
  10px radius (rounded corners are an explicit owner request for phone and
  tablet cards only; the desktop table and other components stay square), a
  soft two-layer shadow that lifts on hover only where `(hover: hover)`, and an
  immediate 8% navy press tint on the full-card link, clipped to the radius.
- League block: the league crest (a missing crest becomes a soft disc around the
  trophy) spans two lines: the league name (11px semibold navy, one line,
  ellipsis) over the competition's country code and the state (10px). The code
  comes from domain `country-code` (FIFA trigrammes: ENG, ESP, ITA, GER, FRA,
  POR, NED, KSA, TUR, SCO, BEL…; API-Football's "World" reads INT; an unlisted
  country derives one). The state is the kickoff time in bold navy
  (`ENG · 13:30`), the live minute or phase in bold live red after a dot that
  pulses while play runs (`ENG · ● 67′`, `HT`, `Break`, `1H`, `2H`, `ET`,
  `Pens`, `Int.`, `Susp.`, `Live`), `FT`/`AET*`/`Pens*` in bold muted, or a
  short halted state in bold amber (`Postp.`, `Canc.`, `Abd.`, `Awd.`); `TBC`
  stands for a missing kickoff. The line is decorative: the `time` element (full
  day, time and EAT) and the score-line block stay as hidden text. A hairline
  rule follows the block. The weekday no longer shows, as the owner specified
  country then time; on a multi-day range the day stays in hidden text only.
- Teams: `HOME [crest] centre [crest] AWAY`. Each label is the fixture team's
  provider code when valid (`validTeamCode`), else `teamAbbreviation(name)`, and
  `cardTeamAbbreviations` guarantees the two differ (below). Labels are 11px
  bold in a slot of 2.375em of their type (26px), the home one right-aligned
  against its crest and the away one left-aligned after its crest; a wider label
  (Manrope Bold advances above 2.375em: WOH, MUM, RWW, most 4–5 character codes)
  sets at 90%, which fits every derived abbreviation of the 5,251 stored teams.
  After a decided final the loser's label is muted. Crests are 16px (initials,
  10px, fall back to a ringed disc). The centre is `vs` (10px muted) before
  kickoff and the score (`2–1`, 11px heavy, proportional digits so `0–0` fits
  the 21px track; live red while live) once live or final. Full names stay in
  the card heading, as hidden text beside each label and as each label's
  `title`: where the pointer can hover, the label rises above the card link so
  the tooltip shows, and the card forwards a click on it to the link.
- Chips: the market code (`market.code.*`: 1X2, DC, O/U 2.5, BTTS; grey), the
  short pick (`market.pick.*`: 1, X, 2, 1X, X2, 12, Over, Under, Yes, No; the
  family's clean tint and text colour) and the bold probability chip at a fixed
  width so it aligns down the list. Pending keeps the family tint with a 40%
  family ring and leads with the padlock once locked; Correct, Incorrect and
  Void take the outcome's green, red or grey tint and lead with ✓, ✗ or ⊘.
  Without a pick the cluster is the market code and a muted `—` (no empty pill,
  no probability chip); the reason stays in the hidden label. A grey price chip
  follows only when the fixture carries a public price for exactly the shown
  pick (`selectedCardPrice`, prompt 052); while odds are private `prices` is
  empty, so it is normally absent. Below 390px the market code hides the part
  after its last space, the goal line (`O/U` for `O/U 2.5`); the product offers
  only the 2.5 line and the hidden label names it.
- Chevron: decorative, in the card's end padding, centred on the row.

Tracks: league `minmax(0, 1fr)`, teams fixed (two label slots, two crests, the
centre and their gaps), chips `minmax(max-content, 1fr)` with the cluster's
minimum width raised to the widest cluster (`O/U 2.5` + `Under` + probability),
so the rule, teams and probability chips align down the list; a wider cluster
(a price chip) widens its own card's track instead of overlapping. On tablets
the league and chips tracks share the spare width, so the teams sit centred.
Text-sized lengths are rem and the variants are rem media queries, so enlarged
text scales the spacing and reaches the narrower variants. Card text is 10px
or larger; small-text colours keep 4.5:1 or better on their fills (muted text,
live red, amber, the grey chip and each family and outcome tint; see
tests/market-colors.test.mjs for the market hues).

Widths from CSS arithmetic and Manrope advance widths (kerning ignored). Card
is the viewport minus 16px gutters; content is the card minus its 1px borders
and start/end padding; the league track holds its crest, gap and text plus the
3–4px rule padding and the 1px rule:

| Viewport | Card | Content | League track (text) | Teams (label slot) | Chips track | Height |
| --- | --- | --- | --- | --- | --- | --- |
| 320px (narrow) | 288 | 268 | 58.1 (58.1, name hidden) | 105.9 (24.9) | 94.0 | 54 |
| 360px | 328 | 306 | 78.8 (58.8) | 113.2 (26.1) | 104.0 | 54 |
| 375px | 343 | 321 | 93.8 (73.8) | 113.2 (26.1) | 104.0 | 54 |
| 390px | 358 | 336 | 92.8 (72.8) | 113.2 (26.1) | 120.0 | 54 |
| 412px | 380 | 358 | 114.8 (94.8) | 113.2 (26.1) | 120.0 | 54 |
| 430px | 398 | 372 | 109.0 (85.0) | 130.0 (28.5) | 120.0 | 56 |
| 512px | 480 | 450 | 125.2 (95.2) | 149.8 (30.9) | 156.0 | 60 |

The widest clusters: 102.7px at 360px (`O/U` + `Under` + 38px probability),
119.5px from 390px (`O/U 2.5` + `Under` + 38px), 93.7px at 320px and 155.0px
from 512px. The league line needs 52.6px for `ENG · 13:30` and 58.1px for the
widest common state, `ENG · Postp.`; a longer line clips its state with an
ellipsis. From 412px "Premier League" (82px) fits; longer league names end in
an ellipsis (the hidden text keeps them). The probability chip holds the padlock
or mark beside a two-digit percent (37.4px in 38px; 32.3px in 33px at 320px;
46.5px in 48px from 512px).

Variants (viewport rem): from 430px (26.875rem) crests grow to 18px, labels to
12px, the score to 13px and chips to 24px tall (56px card); from 512px (32rem)
crests are 22px, labels 13px, chips 11–12px in 26px pills and the league line
11px (60px card). Below 390px (24.375rem) the market code drops its line. On
320–359px phones (20–22.49rem) the league name becomes hidden text and the
crest sits over the country/time line, crests are 14px, labels 10.5px and chips
tighter. Below 20rem (only with enlarged text, such as 125% on a 360px phone, or
viewports under 320px) the teams and chips move under the league block, and
below 16.25rem (150% or more) each gets its own line. Notes add a row (about
20px) only when present, because they carry delays and coverage gaps.

#### Team labels

Domain `team-name` documents and unit-tests the derivation:
`teamAbbreviation(name)` strips accents (NFKD) and transliterates letters that
do not decompose (Ø, Æ, Œ, ß, Ł, Đ, Þ), drops club-type tokens (FC, CF, SC, AFC,
CD, AC, CA, SL, FK and similar: AS, SSC, VfB, HNK, IF, BK…), women's, reserve
and youth qualifiers (W, Women, II, B, U21, Sub-20…), linking words (de, del,
da, do, la, el, los, the, of, al…), lone initials and numbers. A leading common
prefix (Real, Atlético, Deportivo, Sporting, Club, Racing, Union, Inter, Dynamo,
Dinamo, Olympique, Borussia, Saint/San/Santa/São, Hapoel, Maccabi…) followed by
another word gives the prefix initial plus two letters of that word (Real
Madrid RMA, Atletico Tucuman ATU, Sporting CP SCP); otherwise the first three
letters of the first remaining word (Platense FC PLA, Juticalpa JUT, Boca
Juniors BOC, Al-Hilal Saudi FC HIL). Too few letters take the name's numbers
(B 93 B93).

`cardTeamAbbreviations(home, away)` uses valid codes first. When both labels
read the same, a side with a code keeps it and each derived side takes the same
fallback rule at each step: initial plus two letters of the second word
(Manchester United v Manchester City: MUN v MCI), the second word's first three
letters (Stade Rennais v Stade de Reims: REN v REI), the initials of three
words (Real Madrid v Real Madrid Castilla: RMA v RMC), the first two letters
plus the last (Bocholt), then every first-letter-plus-two-later-letters form,
and as a last resort a digit on the away label (identical codes: ARS v AR2).

**Where codes come from.** Fixture snapshot teams carry an optional `code`
(`fixture-snapshot.ts`; 2–5 capital letters or digits, or null). The feed and
detail read (`storedFeedFixture`) publish `validTeamCode(FootballTeam.code)`,
and the card checks it again. Codes are stored by the spare-quota team-code
import ([football catalog](football-catalog.md#team-codes-spare-quota-import));
until a team's league is imported (and always for clubs the provider never
codes) the card shows the derived abbreviation. On 11 October 2026 no stored
team had a code yet, so every label was derived.

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
its `--gh-logo-size` square before loading (14–22px on phone tiles, 22px in table rows). Default loading is lazy; callers may explicitly opt into eager loading
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

The nine domain/state contract tests cover family independence, supplied
outcomes, binding/validation, all sources/notices, boundary/group rounding,
Unicode initials, structural URL checks, actual EAT times and atomic version
replacement; further tests keep a short market code and pick for every family
and selection, check that only the total-goals code has a hideable goal line,
keep every league-line state within six characters and give every no-pick
reason visitor text. `tests/team-name.test.mjs` covers the abbreviation rules
(the documented examples, accents, ignored tokens, prefixes, short names),
codes first, collision handling over every pair of a near-identical sample,
code validation and the label width helpers; `tests/country-code.test.mjs`
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
