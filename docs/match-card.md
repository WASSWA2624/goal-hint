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
| `team-logo` | `TeamLogo`: shared by cards and match details, with a team name, optional image URL and explicit eager/lazy loading. Containers size it with `--gh-logo-size` (default 32px) and may place it by its `data-team-logo` attribute. Initials remain visible when a logo is missing or fails. |
| `probability-label` | `ProbabilityLabel`, `ProbabilityLabelProps`: a complete `AcceptedMarket`, optional selection within that market, and locale. Displays an estimated probability using domain group rounding. |
| `outcome-badge` | `OutcomeBadge`, `OutcomeBadgeProps`: one canonical settlement outcome status and locale. Explicit text plus the shared decorative icon; no live-region announcements for static cards. |
| `match-card-list` | `MatchCardList`: native list with caller-supplied `li` children and an optional locale. One column of tiles below `lg` (64rem) and an aligned table with a decorative navy column header from `lg`. Source order remains visual and keyboard order. |
| `match-icons` | Decorative inline SVG icons (`aria-hidden`, not focusable). |
| Domain `prediction-label` | `predictionLabel` supplies generic full-word outcomes to cards, details, history, slips and metadata. `predictionRuleLabel` formats extended market rules without participant-name substitution or lost goal lines. |

Desktop presentation retains its compact table composition:

When multiple market families are eligible, `bestCardFamily` uses the shared
`bestPublishedFamily` ranking: highest unrounded win probability, then the
higher available fresh price for the exact published family and selection.
Remaining ties use policy order. Selection, probability, odds and result always
come from that one shown published pick; an unrelated family cannot fill a
missing field.

1. Header: competition (and country), compact local kickoff day and time in one
   `time` element whose title carries the full instant and displayed zone.
2. Teams: logos and names either side of a centre state. Scheduled shows `VS`;
   live shows the score and a red chip with the provider minute (`67′`) or
   phase (`HT`, `Break`, `Penalties`…); finished shows the score with `FT`,
   `AET*` or `Pens*` (the asterisk marks a 90-minute score, explained in the
   chip title and hidden text); postponed/canceled/abandoned/awarded show a
   neutral status chip.
3. Pick: the market family, selection, estimated percent and prediction result. On
   desktop the family is a tag washed from the family tint into white, with a
   1px family ring, a solid 3px family edge and bold family-coloured text
   (inset shadows draw the ring and edge, so rows keep their height); the
   full-word pick sits in a pill in the family's gradient. An available exact-pick
   price appears on a small secondary line beneath the selection. The Result
   column explicitly shows Win, Loss, Pending or Void. Missing predictions show
   Unavailable with dashes for probability and result; they never appear as 0%
   or Pending. Phone and tablet cards use the flat strip described below.

Source, provisional status and publication time move to the pill tooltip; sync
time stays on the detail page. On desktop each card becomes one table row
using `match-columns.ts` tracks and CSS subgrid: #, time, league, home, score,
away, market, prediction, probability, result and a chevron. Column headers and
rows share the same eleven grid tracks at compact and wide desktop sizes.
The desktop column header stays below the sticky app menu while the board
scrolls. Its offset shares the app header's content-height and border tokens.
The number track uses the largest displayed row number, capped at the formatted
width of 9,999. Row numbers up to that value never wrap; larger numbers may wrap
within the same capped track. The desktop results heading is 16px and stays on
the left, with its match count aligned to the right.

### Phone and tablet tile (below 64rem)

The mobile card has four visible rows:

1. Match date and 24-hour local kickoff time with a visible zone together on the left; a match status badge on the right. Upcoming and Ended use neutral tones. For live matches the red badge shows the supplied elapsed minute, including stoppage notation such as `90+4′`, instead of Live. With no minute, it shows the actual phase or a dash when the phase is unknown.
2. Country flag and FIFA code on the left; one-line, ellipsized league name and competition logo on the right, with the logo at the outer edge.
3. Single-line home name and crest, compact centered match state, away crest and single-line name. A live match shows its bold score in place of VS, with no minute repeated beneath it. Upcoming matches show VS; finished matches retain their score and final state.
4. One flat strip with four equal cells separated by thin vertical dividers. Each
   cell contains a tiny caption (Market, Pick, Prob. or Result) above
   its value. Every viewport uses full market and selection names, such as
   `Home win`, `Home or draw`, `Over 2.5` and `Not both teams to score`,
   with the exact available price on a small Odds
   line beneath the prediction. The strip has no boxed pills, gradients or
   shadows. Its fill uses the light or dark theme's neutral surface.

All screen sizes show 24-hour kickoff times with the device's time-zone label after hydration and a stable EAT server fallback. Display formatting never changes the stored instant or EAT reporting date. Within the existing desktop league column, full country names sit above the league name and logo and may wrap. Recognized provider abbreviations such as `USA` expand for desktop display; raw country values still drive flags and filters. Desktop league and team names remain on one line with ellipsis and full-value titles. Shared grid rows align the league logo/name, both team names/logos, score, market, prediction, probability and result, including when the country wraps. The live/final status remains below the score. Generic prediction wording is shared with details, history, slips and metadata; extended totals retain their actual lines, including `Under 1.5`. Stored historical labels and their hashes stay unchanged.

Cards use 6px padding, 3px internal row gaps, 8px page gutters and 6px list gaps.
Metadata and team names are 12px, bold scores 14px, and prediction captions 10px.
Team names use the shared medium weight. Fine borders and square edges separate
white or dark cards from the darker page canvas; mobile cards have no shadow.
Long names ellipsize on one line. Captions, metric values and the secondary odds
line stay on one line, with bounded ellipsis only at unusually narrow effective
widths or enlarged text. Full semantic descriptions remain accessible. Text
uses rem units and card/cell heights are never fixed.

The result uses explicit text: green Win, red Loss, amber Pending and neutral
Void. A missing prediction and its probability/result display dashes on mobile;
desktop retains Unavailable in the prediction column. The full missing-prediction reason is in
accessible text. Only supplied, correctly bound final settlements can show
Win/Loss; live score changes never settle a pending prediction. Scheduled
matches show VS without an invented score. Running clocks include available
`stoppageMinutes`; paused phases retain their phase label. Postponed, canceled,
abandoned, awarded and paused live states retain their actual labels.

Local MIT-licensed SVG flags in `public/flags` resolve recognized football countries, including England, Scotland, Wales and Northern Ireland, and work without a remote image request. A safe supplied provider flag is a secondary fallback. Unknown countries never borrow another country's flag from a derived abbreviation; international fixtures retain a globe. League/team images keep the existing URL safety and loading fallback behavior.

The same full-card link, canonical navigation, hidden full team names and
score/outcome descriptions remain accessible. Cards render no warning strip,
notice list or notice-related `aria-describedby` reference on any screen.
Public odds for the selected pick appear beneath the
prediction and remain in its tooltip and accessible text. No unrelated or
missing price fills that line. Long team names ellipsize with full names in
the heading/link and a hover tooltip; league names truncate first.

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
then View analysis. Decorative visual text (score digits,
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
| Fixture | `liveClock?: { phase, minute, stoppageMinutes? } | null`, present only while `status` is `live`. Phases: first-half, half-time, second-half, extra-time, break, penalties, interrupted, suspended, in-play. `minute` is the provider elapsed minute for running phases and null while play is paused. Optional `stoppageMinutes` retains supplied additional minutes; an unknown minute is never invented. |

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
`FixtureResult` version (`providerStatus`, `elapsedMinutes` and optional `stoppageMinutes`) with
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

Correct and Incorrect use green Win/red Loss text, Pending uses amber text,
and Void uses a neutral tone. Explicit labels and hidden descriptions preserve
their meaning without depending on colour. Unavailable predictions have no
invented correctness or probability. Fixture status and score remain separate
from prediction outcome.

Source comes from the selected market (AI prediction or API-Football fallback).
The card's pill tooltip names the source and the actual forecast `publishedAt`
as a full Gregorian local date/time label; the detail page keeps the visible
publication `time`. Kickoff uses the same shared calendar
validation and device time zone, with a stable EAT server fallback. Browser locale/time zone and the
current clock cannot change the supplied instant or reporting cohort. Formatting caches contain
only immutable `Intl` formatters, never visitor data.

The pill tooltip says Provisional estimate unless trusted server data
qualifies the forecast otherwise. Presentation makes no calibration claim.
Delayed updates, limited news and partial coverage remain stored facts without
adding a card notice strip. The detail page retains its provenance and coverage notices.

Cards retain the locked-prediction hidden text and the concise no-pick reason
for a missing selection, an in-progress refresh or outside-window availability.
`syncedAt` is shown on the detail page, not the card. The card does not select another revision
or change timestamps. Feed and detail links share `domain/match-slug.ts`.

## Remote logos and fallbacks

`isSafeRemoteImageUrl` is shared with catalog import, provider normalization and
trial evaluation. It requires a bounded HTTPS URL without credentials, query,
fragment, whitespace, controls or backslashes. This structural check does not
grant media rights: the server catalog/provider approval still decides which
exact URLs may be projected to visitors.

Logos use native `styled.img`, empty alt text, size-matched width/height
attributes and `object-fit: contain`. Approved API-Sports team and league PNGs
use the shared `providerImageSource` helper and a Next.js cached badge route,
with bounded provider paths/sizes, no redirects and seven-day revalidation.
Other approved hosts keep their original URLs. The importer still stores URLs
only; the cache does not grant additional media rights. The container reserves
its `--gh-logo-size` square before loading. Default loading uses one shared
IntersectionObserver with a 120px margin, so offscreen badges retain initials
without downloading provider PNGs thousands of pixels ahead. Unsupported browsers
fall back to native lazy loading. The server carries the approved URL in
`data-logo-src`; the observer sets `src` as the image approaches the viewport.
Callers may explicitly opt into eager loading
for known above-the-fold cards. Requests use `no-referrer`. The application
cache fetches approved provider originals on demand and serves resized badges;
there is no image database column or catalog-time binary download.

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
node --conditions=react-server --test tests/stoppage-time.test.mjs
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
The live rendering example is a 2–0 score at `67′` with a Pending prediction;
the verifier checks its elapsed-minute status badge and absence of VS.
Stoppage-time and unknown-minute domain cases are covered separately by
`tests/stoppage-time.test.mjs`; they are not additional rendering examples.

Playwright CLI acceptance checks initial server DOM before releasing JavaScript,
cached image hydration, market switching, every link's tab order/focus, Enter
activation, direct image requests, 404/429 and replacement URLs, all five
viewport widths (320, 360, 390, 430 and 1280px), 200% text at 320px, and a
JavaScript-disabled context. Synthetic HTTPS image requests are intercepted
with local test responses; this verifies browser transport/fallback behavior,
not real-provider CDN reliability or media rights. Browser artifacts remain
under ignored `output/playwright/`. Actual results are recorded in
[development progress](development-progress.md).

Ended fixtures display the final score without VS on every screen. Unknown final scores display a dash. Phone cards use square edges and a fine border on a cool canvas.
