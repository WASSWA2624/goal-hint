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

1. Upper track: the row number (`#`) aligns with the country flag and full
   country name. The Date & Time column shows the kickoff date here. While the
   match is live, the provider's elapsed minute (`67′`, `90+4′`) or live phase
   (`HT`, `Break`, `Penalties`…) with a glowing red dot fills the Result column
   in place of the Pending tag. When the match ends, `FT`, `AET*` or `Pens*`
   occupies the status slot above the score and the Result column returns to
   the verdict. The asterisk identifies a regulation-only score and has
   explanatory tooltip and accessible text. Postponed, canceled, abandoned
   and awarded fixtures retain their actual status; scheduled fixtures have
   no elapsed-minute or final-status chip.
2. Lower track: the league logo and name, both team names and logos, score
   (or scheduled `VS`), market, prediction, probability and result share one
   vertical alignment. The local 24-hour kickoff time and its zone sit beside
   the date in the Date & Time column, on its second line. One semantic
   `time` element retains the date and time, a full UTC ISO `datetime` and a
   title with the full instant and displayed zone.
3. Pick: the market family, full-word generic selection, available exact-pick
   price, estimated probability and result each stay in their existing
   columns. Square family-tinted tags and bordered prediction values retain
   the existing colour theme. The Result column shows Upcoming for every
   scheduled match, even when no prediction is available. Live and completed
   matches retain their actual prediction result: Win, Loss, Pending, Void or
   an unavailable dash. Missing probabilities never appear as 0%.

Source, provisional status and publication time move to the pill tooltip; sync
time stays on the detail page. On desktop each card becomes one table row
using `match-columns.ts` tracks and CSS subgrid: #, date, league, home, score,
away, market, prediction, probability, result and a chevron. Column headers and
rows share the same eleven grid tracks at compact and wide desktop sizes.
The desktop column header stays below the sticky app menu while the board
scrolls. Its offset shares the app header's content-height and border tokens.
The number track uses the largest displayed row number, capped at the formatted
width of 9,999. Row numbers up to that value never wrap; larger numbers may wrap
within the same capped track. The desktop results heading is 16px and stays on
the left, with its match count aligned to the right.

### Phone and tablet tile (below 64rem)

The mobile card ("Verdict Corner", design 09) has three rows on one grid
(`"meta result" "teams teams" "pick pick"`), about 75px tall in every state:

1. **Meta and verdict.** One quiet muted line: country flag, one-line ellipsized
   league name, `·`, then the kickoff date and 24-hour time with its zone. An
   upcoming match's clock is bold; other states keep it muted. When enlarged
   text leaves the line narrower than the kickoff needs (the card is a
   `match-card` inline-size container; below 18rem), the league takes the
   first line and the kickoff moves to a second one instead of running under
   the tag. The result tag
   owns the top-right corner (at least 4.75rem wide, overlapping the card's
   border). Tags use the bright `theme.color.verdict` palette with dark text
   (5.8:1 or better in both themes): bright green Win with a check, coral Loss
   with a cross, amber Pending, light slate Void, and a pale amber tag with an
   amber border for Upcoming. Labels are uppercase words; an unavailable result
   shows no tag. The desktop Result column uses the same colours, and every
   badge fills the column so all results share one width.
2. **Teams.** Home name and crest, the centre column, away crest and name, with
   each crest beside the centre. The centre shows `vs` (scheduled or halted) or
   the bold score (all red while live, the losing side muted once final), with the state
   beneath it: `FT`, `AET*`/`Pens*`, or a halted status such as Postponed in grey.
   While live, the side ahead has the bold name and the corner tag shows the live
   minute with a glowing red dot (`67′`, `90+4′`, or the phase) instead of Pending.
3. **Pick line.** Right-aligned under the teams: market caption in its family colour, the full-word pick
   (`Home win`, `Over 2.5`, `Not both teams to score`), the exact available
   price as `@ 1.85`, and the probability as `54% likely`. At narrow widths the
   word "likely" drops first (it wraps onto a clipped second line, never below
   the percentage's own width) and the market caption shortens next, so the
   pick and its numbers stay whole. A missing pick reads `No pick · Too early` (the
   short reason). The decorative meter and the bracketed desktop price stay in
   the markup but are hidden on the tile.

All screen sizes show 24-hour kickoff times with the device's time-zone label after hydration and a stable EAT server fallback. Display formatting never changes the stored instant or EAT reporting date. Desktop keeps both date and kickoff clock in the Date & Time column; elapsed time and FT share the separate status slot above the score. An unknown kickoff retains its localized date-column fallback without inventing a clock or `datetime`. Phone date/time composition stays unchanged. Within the existing desktop league column, the country sits above the league name and logo on one line: a long recognized name (over 13 characters) uses a familiar short form from `countryShortName` (Dominican Rep., Bosnia & Herz., N. Ireland, UAE…), anything still too wide ends in an ellipsis, and the full name stays in its title. Recognized provider abbreviations such as `USA` expand for desktop display; raw country values still drive flags and filters. Desktop league and team names remain on one line with ellipsis and full-value titles. Shared grid rows align the row number with the country and align the league logo/name, both team names/logos, score, market, prediction, probability and result on the lower track, with the country on its single line. Generic prediction wording is shared with details, history, slips and metadata; extended totals retain their actual lines, including `Under 1.5`. Stored historical labels and their hashes stay unchanged.

Tile rows use 10px side padding, 8px page gutters and 6px list gaps. Metadata
is 11px, team names and picks 12px bold, scores 16px, and captions, state and
the result tag 10px. The list's offscreen placeholder
(`contain-intrinsic-block-size`) matches the 75px card. Fine borders and square edges separate
white or dark cards from the darker page canvas; mobile cards have no shadow.
Long names ellipsize on one line. Captions, metric values and the inline price
stay on one line, with bounded ellipsis only at unusually narrow effective
widths or enlarged text. Full semantic descriptions remain accessible. Text
uses rem units and card/cell heights are never fixed.

The result uses explicit text: Upcoming for scheduled matches, green Win,
red Loss, amber Pending and neutral Void. Upcoming uses the pending colour
tone and remains visible on desktop and mobile, including a scheduled match
without a pick. Other missing predictions retain their no-pick presentation
and unavailable result. The full missing-prediction reason is in
accessible text. Only supplied, correctly bound final settlements can show
Win/Loss; live score changes never settle a pending prediction. Scheduled
matches show VS without an invented score. Running clocks include available
`stoppageMinutes`; paused phases retain their phase label. Postponed, canceled,
abandoned, awarded and paused live states retain their actual labels.

Local MIT-licensed SVG flags in `public/flags` resolve recognized football countries, including England, Scotland, Wales and Northern Ireland, and work without a remote image request. A safe supplied provider flag is a secondary fallback. Unknown countries never borrow another country's flag from a derived abbreviation; international fixtures retain a globe. League/team images keep the existing URL safety and loading fallback behavior.

The same full-card link, canonical navigation, hidden full team names and
score/outcome descriptions remain accessible. Cards render no warning strip,
notice list or notice-related `aria-describedby` reference on any screen.
Public odds for the selected pick appear beside the
prediction (bracketed on desktop, `@ price` on the tile) and remain in its tooltip and accessible text. No unrelated or
missing price fills that line. Long team names ellipsize with full names in
the heading/link and a hover tooltip; league names truncate first. Any ellipsized text in the app shows its full value on mouse hover: `TruncationTooltips` (root layout) finds the cut-off text under the pointer, beneath the full-card link too, and puts its own title or rendered text on the hovered element, leaving page-set titles alone and ignoring touch.

Browser acceptance covers 320, 360, 390 and 430px, 200% root text, long names, scheduled/live/final states, local flags, three visible rows with the corner result tag and no page/card horizontal overflow. Date controls stack at narrow effective container widths to preserve readable labels with enlarged text.

**Team codes.** Fixture snapshot teams still carry an optional provider `code`
(`fixture-snapshot.ts`; the feed and detail read publishes
`validTeamCode(FootballTeam.code)`), stored by the spare-quota team-code import
([football catalog](football-catalog.md#team-codes-spare-quota-import)). Cards
do not display it, following the owner's decision for full names.

Use the existing root style provider. The desktop table uses the per-family
`theme.color.market` hues (match result
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

Every viewer gets that same canonical link, locked cards included, so crawlers
and free viewers reach each match page; its locked panels carry the sign-up and
subscribe links, and the feed banner keeps its own. A card locks (Locked
prediction, public chance, subscribe line) only over a published forecast the
viewer cannot see. An unfinished fixture without one shows the same
no-prediction reason subscribers read (`forecast: null` already says so in the
free payload), and the match page's verdict, markets and analysis follow the
same rule; revision history stays locked. `tests/seo-card-links.test.mjs`
server-renders these cards and sections.

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
`cardResultStatus` changes only the presented result of a scheduled fixture
to Upcoming; it never changes that market settlement or fabricates a pick.
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
three-row geometry with the corner result tag and natural height growth with enlarged text.
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
