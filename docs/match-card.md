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

The same DOM becomes a compact white card in the owner's chosen layout A, "teams
get their own line". Owner decisions in force: full team names only (no club
abbreviations and no provider team codes), team crests right beside the score,
the home name right-aligned, the country flag and code leading the meta line
followed by the match time, near-square corners (2px) on the card and chips, no
chevron (the whole card stays one link), and the reference photo's chip style
for the prediction.

```text
[flag] ARG · 13:30 · [crest]? Liga Profesional…     [1X2] [ 1 ] [ 62% ] [2.10]?
        River Plate [crest]  1 – 1  [crest] Boca Juniors
```

- Surface: `theme.color.surface`, a hairline `theme.color.border` border, a
  2px radius, padding 7px 9px (8px sides below 360px) and a soft two-layer
  shadow that lifts on hover only where `(hover: hover)` (with the shared
  `rowHover` tint). The existing full-card `Open` link (accessible name "View
  analysis for Home v Away") gives an immediate 8% navy press tint inside the
  border. The chevron stays in the DOM for the desktop table's open column but
  is `display: none` on tiles, so it is neither drawn nor announced there.
- Row 1, the meta line (11px): the competition's country flag, its
  three-letter code, the state, then the league name, all on one line.
  - Flag: 16×11 from `fixture.competition.countryFlagUrl` when present
    (optional, typed so the card compiles before the catalog supplies it;
    `isSafeRemoteImageUrl`, lazy, async decoding, `no-referrer`, explicit size,
    `object-fit: cover`, a hairline ring so white flag fields keep an edge). A
    missing, unsafe or failed image shows a neutral flag glyph, or a globe for
    API-Football's international "World"; a replacement URL gets a fresh attempt.
  - Code: domain `country-code` (FIFA trigrammes: ARG, ENG, ESP, ITA, GER,
    BRA, KSA…; "World" reads INT; an unlisted country derives one), semibold
    muted.
  - State, after a dot: the kickoff time in bold navy (EAT, `13:30`), the live
    minute or phase in bold live red after a dot that pulses while play runs
    (`67′`, `HT`, `Break`, `1H`, `2H`, `ET`, `Pens`, `Int.`, `Susp.`, `Live`),
    `FT`/`AET*`/`Pens*` in bold muted, or a short halted state in bold amber
    (`Postp.`, `Canc.`, `Abd.`, `Awd.`); `TBC` stands for a missing kickoff.
  - League name, after a dot: semibold navy, one line, taking the remaining
    width with a zero flex basis, so it ellipsizes first; only when it is gone
    does the state clip. From 390px the league crest (14px) precedes it when
    the competition has one (no trophy stand-in on tiles).
  - The line is decorative (`aria-hidden`): the `time` element (full day, time
    and EAT), the hidden country after the league name and the score-line block
    keep the spoken versions.
  - Chips, right-aligned on the same line, 18px tall: the market code
    (`market.code.*`: 1X2, DC, O/U 2.5, BTTS; 10px bold, muted on
    `surfaceMuted`), the pick (`market.pick.*`: 1, X, 2, 1X, X2, 12, Over,
    Under, Yes, No; 11px bold in the family's clean tint and text colour) and
    the probability (11px heavy, the family tint with a 40% family ring).
    Settled outcomes tint the probability chip: Correct green with ✓, Incorrect
    red with ✗, Void grey with ⊘; a locked pending pick leads with the
    padlock. Each chip has a fixed slot in em of its type, so chips align in
    columns down the list: market 3.6em ("O/U 2.5", 3.59em), pick 2.97em
    ("Under", 2.96em) and probability 2.2em plus the 8px mark and its gap (a
    two-digit percent is at most 2.197em); wider content (`<1%`, `>99%` with a
    mark) widens its own chip, never clips. Without a pick the cluster is the
    market chip and a muted `—` centred in the pick slot, with the probability
    slot left empty so the market chip stays aligned; the reason is the `—`'s
    title and stays in the hidden label. A grey price chip follows only when the
    fixture carries a public price for exactly the shown pick
    (`selectedCardPrice`, prompt 052); while odds are private `prices` is empty,
    so it is normally absent. Below 360px chips keep 3px padding and 2px gaps
    and the market code hides the part after its last space, the goal line
    (`O/U` for `O/U 2.5`, slot 2.55em for "BTTS"); the product offers only the
    2.5 line and the hidden label names it.
- Row 2, 5px below, the teams line on the full card width: a symmetric grid
  `minmax(0, 1fr) auto auto auto minmax(0, 1fr)` holding HOME NAME, home crest,
  centre, away crest, AWAY NAME, so the score sits in the middle of every card
  and the crests line up down the list. Names are the full team names (13px
  semibold navy, one line, ellipsis), the home name right-aligned with 4px
  before its crest and the away name left-aligned 4px after its crest; after a
  decided final the loser's name is muted. Crests are 18px (initials, 10px,
  fall back to a ringed disc). The centre column is at least 34px with 2px
  either side: `vs` (11px muted) before kickoff, the score (`1 – 1`, 13px bold,
  proportional digits, the dash muted; live red while live) once live or
  final, widening for three-character scores. Full names are always in the
  card's hidden heading and link name. Where the pointer can hover, entering a
  card whose name is truncated (`scrollWidth > clientWidth`) sets the article's
  `title` to both full names ("River Plate v Boca Juniors"); the covering link
  shows its nearest titled ancestor's tooltip, so the link's own name and
  description stay unchanged, and untruncated cards carry no title.
- Notes, when present, add a row under the teams (6px above it).

Height: 1 + 7 + 18 (chips) + 5 + 18 (crests) + 7 + 1 = 57px at every phone
width; notes add about 20px. Below 20rem (only with enlarged text, such as 125%
on a 320px phone) the chips take their own line under the meta line (74px at
the default text size, as the 14px meta line no longer shares the chips' row).
Text-sized lengths are rem and the variants are rem media queries, so enlarged
text scales spacing and reaches the narrower variants. Card text is 10px or
larger.

Widths from CSS arithmetic and Manrope metrics (the brand variable font
instanced at wght 600/700/800 with its GPOS pair kerning). The card is the
viewport minus the 16px list gutters; content is the card minus its 1px borders
and side padding. Chips: the three slots plus two gaps. Meta line: content minus
the chips and the 6px column gap (4px below 360px). League name: the meta line
minus the flag (16 + 4), the code, two dots (8.3px each) and the state, shown
for `ENG · 13:30` (87.3px) and, worst common case, `KUW · Postp.` (96.2px), less
the 18px league crest from 390px. Name box: (content − 2 × 18 crest − 34 centre
− 2 × 2) / 2 − 4.

| Viewport | Card | Content | Chips | Meta line | League name (worst) | Name box, each | Height |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 320px | 288 | 270 | 114.4 | 151.6 | 64.3 (55.5) | 94.0 | 57 |
| 360px | 328 | 308 | 132.9 | 169.1 | 81.8 (73.0) | 113.0 | 57 |
| 375px | 343 | 323 | 132.9 | 184.1 | 96.8 (88.0) | 120.5 | 57 |
| 390px | 358 | 338 | 132.9 | 199.1 | 93.8 (85.0) | 128.0 | 57 |
| 412px | 380 | 360 | 132.9 | 221.1 | 115.8 (107.0) | 139.0 | 57 |
| 430px | 398 | 378 | 132.9 | 239.1 | 133.8 (125.0) | 148.0 | 57 |

"Premier League" needs 81.6px, so it fits from 360px. Of the 5,234 team names
on stored fixtures (11 October 2026, measured at 13px semibold), these fit
untruncated: 3,781 (72.2%) at 320px, 4,638 (88.6%) at 360px, 4,840 (92.5%) at
375px, 4,972 (95.0%) at 390px, 5,124 (97.9%) at 412px and 5,178 (98.9%) at
430px; the median name is 74px. "Manchester United" (118.6px) fits from 375px,
"Paris Saint Germain" (121.1px) from 390px; the longest stored name, "San Juan
Atletico de Montcada" (190.8px), ellipsizes up to tablets. Both rows fit
320–430px without horizontal overflow; tablets give the spare width to the
league name and the two names.

Small-text contrast (WCAG, computed): muted `#566574` 5.98:1 on white, 5.55:1
on the hover tint, 4.74:1 under hover plus the press tint; navy 13.2:1 or more;
live red 6.58:1 or more; amber 5.62:1 or more; the grey chip 5.20:1 (4.85:1
pressed); the family pick and probability tints 6.28–7.60:1 (5.87:1 or more
pressed; see tests/market-colors.test.mjs); the outcome tints 6.10–7.54:1.

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
its `--gh-logo-size` square before loading (18px on phone tiles, 22px in table rows; country flags are 16×11 on tiles). Default loading is lazy; callers may explicitly opt into eager loading
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
and selection, check with Manrope metrics (wght 700/800, kerned) that every
market code, short code, pick and two-digit probability fits the chip slots the
card declares, check that only the total-goals code has a hideable goal line,
keep every meta-line state within six characters, give every no-pick reason
visitor text and guard that the card renders full team names (no team-name
abbreviation helpers or provider codes). `tests/team-name.test.mjs` covers
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
