# Shared match-card presentation

Matches, betting slips and the slip builder share the approved Clean ledger
presentation on phones/tablets and Aligned ledger rows on desktop. Presentation
components receive visitor-facing facts; they do not fetch providers, settle
predictions, start polling, access Redux or persist data. Examples remain in
tests and isolated acceptance applications.

## Components and composition

Import directly from the owning module under `@/components/match`:

| Module | Public contract |
| --- | --- |
| `match-card` | `MatchCard`, `MatchCardProps`: validated `fixture`, canonical `analysisSlug`, optional eligible `markets`/`selectedFamily`, locale, heading level 2–4, lazy/eager logos, one-based `position`, access state and original `snapshotPick`. It owns the existing authorized pick/gating projection and chooses the list's responsive presentation. |
| `match-card-list` | `MatchCardList`: native list with caller-supplied `li` children, optional locale and row-number maximum. It owns one `useDesktopLayout` subscription and provides the result through `MatchCardLayoutContext` to every card. |
| `match-card-layout` | The shared layout context defaults to the original card presentation during server rendering and hydration. A standalone `MatchCard` also keeps that fallback. No per-card media subscription is needed. |
| `desktop-match-row` | `DesktopMatchRow`: the shared desktop renderer for feed fixtures and slip selections. Inputs are supplied teams/competition, kickoff, score, match status/clock and already-authorized market, odds, probability and outcome. It selects no forecast and fabricates no missing facts. |
| `desktop-match-styles` | `desktopMatchBaseStyles` and `alignedLedgerStyles`: one row geometry reused by `MatchCardList`, production desktop slips and their approved design review. |
| `truncated-text` | Full desktop names remain in the DOM. Only clipped text becomes a keyboard-accessible tooltip trigger; focus, hover and Escape retain access to the full value. |
| `clean-ledger-styles` | Shared phone/tablet identity geometry used by match cards and slip selections: kickoff/competition, mirrored teams, and compact inline facts. |
| `team-logo` | Shared team/league image treatment, reserved dimensions and initials fallback. Its container controls size through `--gh-logo-size`; missing or failed media retains the supplied name. |
| Domain `prediction-label` | Generic full-word prediction wording and extended market-rule descriptions, without participant-name substitution or lost goal lines. |

`DesktopSlipRow` remains the slip-specific adapter. `slipSelectionCard` and
`snapshotCardPrediction` preserve the original stored names, kickoff, selected
outcome, probability, price and publication. Separately supplied match-state
observations can update the score/clock/result without replacing that original
selection. Feed fixtures are passed directly through the existing `MatchCard`
projection; they are never converted into artificial slip selections or a
manufactured forecast distribution.

The responsive switch follows the existing `SlipCard` pattern: server HTML
contains one original card for each fixture. After hydration, the list selects
Aligned ledger at 64rem and above; phones and tablets retain Clean ledger below
that boundary. A fixture is never duplicated into hidden mobile and desktop
copies. Source order remains list, visual and keyboard order. Memoized cards
continue to use `sameCardFixture`; unchanged observations and header/filter
state do not redraw their content unnecessarily.

## Authorized forecast and state presentation

When several market families are eligible, `bestCardFamily` selects the highest
ranked eligible published pick using the shared ranking/recommendation rules.
Its probability, exact-family selection, price and settlement stay bound to that
one pick. Missing prices remain unavailable; another family's price never fills
the cell. `markets`, `selectedFamily` and the existing default-family policy
retain their normal behavior.

Public match lists contain only canonically completed fixtures. The completed
cohort is selected before filtering, summary counts and pagination; subscriber
lists keep every eligible fixture. Public cache identities include this scope.
An unfinished direct match link displays a subscription notice; its server
projection withholds forecast chances, picks, prices, revision history and live
observations, even for an old kickoff date. Completed results can be public on
the same day. Canonical terminal statuses include played finals, cancellations,
abandonments and awarded fixtures; postponed and unknown fixtures remain
restricted. Reusable locked-card primitives still identify a published eligible
family without inventing a probability or confusing it with `noPickReason`.

The renderer reuses `selectedCardPrediction`, `selectedCardPrice` and
`cardResultStatus`; it does not add settlement rules. Scheduled fixtures show
Upcoming and VS without inventing a score. Running clocks use supplied phases,
minutes and stoppage time; paused phases retain their phase label. Finished,
postponed, canceled, abandoned and awarded fixtures keep their stored status.
Win, Loss, Pending, Void and unavailable outcomes stay distinct from the match
score and progress.

### Desktop: shared Aligned ledger (64rem and above)

The former eleven-track match table, decorative column heading and alternating
row striping are replaced by the same nine-cell composition as betting slips
and the slip builder:

1. Kickoff date.
2. Kickoff time and display zone.
3. Country flag and full country name.
4. League crest and name.
5. Mirrored home/away names and crests around the score or VS, with the supplied
   live/final phase above the centre.
6. Market family and authorized prediction, or the locked/no-prediction content.
7. Exact available odds.
8. Estimated probability, including only explicitly public chance on a lock.
9. Match progress and the independent prediction outcome.

The shared grid uses square edges, quiet dividers, compact row padding and the
active light/dark palette. Coarse pointers retain 44px effective row/analysis
targets. No separate desktop `#` column is introduced: one-based feed positions
remain available in accessible text, and the existing results toolbar keeps the
visible match range/count.

The complete row opens the corresponding match details through a native analysis
link using `matchHref`, the canonical fixture ID and supplied slug, with prefetch
disabled. Its contextual accessible name identifies both teams. Team, country
and league names remain on one line; their native link aliases share that
destination while preserving the complete-text tooltip on hover and focus.
Only clipped aliases add a keyboard stop. The primary row link remains the
keyboard destination for the whole match, supports standard modified-click and
new-tab behavior, and receives restored focus after returning from details.
Heading levels and the similar-result title note remain intact. The group
describes its date, time, competition, score, market, odds, probability and
status; missing kickoff or score never receives an invented time or value.

### Phone and tablet: Clean ledger (below 64rem)

The existing compact three-row cards remain consistent with slip selections:

1. Kickoff date and AM/PM clock precede the league crest/short label and country
   flag/code. Full competition and country names remain available to assistive
   technology and in labels/tooltips.
2. The home name/crest and away crest/name mirror around VS or the supplied
   score. Long names use the shared compact labels while retaining complete
   accessible names. Match progress and independent outcomes keep their existing
   presentation.
3. Market, selected prediction, exact available odds and estimated probability
   share one inline facts row. Gated and missing predictions keep the same
   authorization rules and explicit explanations as desktop.

The single-column native list retains 6px card spacing, square themed frames,
no card shadow and offscreen `content-visibility` optimization. Cards reflow at
narrow effective widths or enlarged text without clipping. The phone/tablet
analysis link remains a full-card target with the contextual accessible team
names and native keyboard and new-tab behavior.

## Time, images and offline behavior

Date/time display uses the shared `Messages` formatters. Feed kickoff formatting
adopts the device display zone after hydration with a stable EAT server fallback;
slips retain their reporting-zone default. UTC instants, EAT reporting cohorts,
forecast publication and stored snapshot values are never rewritten by visual
formatting. An unknown kickoff keeps its localized fallback without an invented
clock or `datetime`.

Local MIT-licensed flags in `public/flags` resolve recognized football countries,
including England, Scotland, Wales and Northern Ireland. Provider media keeps
the existing safe-URL, lazy loading and fallback policy; unknown countries never
borrow another country's flag. Feed logos remain lazy to avoid third-party
preloads competing with the page's own font, CSS and scripts.

`offline` retains the anonymous saved-view boundary: no forecasts, external
image requests, live claim or match-detail action. The shared desktop row
receives only the saved presentation and no analysis link or metadata link
aliases. Callers that disable analysis links retain the same non-navigable
presentation. Existing generic prediction labels, goal lines, hidden
score/outcome descriptions, theme contrast and missing-data semantics remain
unchanged.

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

Ended fixtures display the final score without VS on every screen. Unknown
final scores display a dash. Phone cards use square edges and a fine themed
border on the selected white or navy page surface.
