# Stored match detail page

Prompt 035 serves `/en/matches/{fixtureId}/{home-v-away}` through the existing
stored-data detail service. API and page share `readPublicMatchDetail`, the 031
response cache, permission checks and safe DTO. Server Components call the reader
directly. Request-scoped React caching shares one stored projection between the
page and its metadata; no internal HTTP request or client polling is necessary.

## Routing and rendering

Canonical UUID determines identity. Uppercase UUIDs and changed decorative slugs
redirect permanently to the service's canonical path. Malformed identities and
unknown fixtures return real HTTP 404s. Storage/configuration failures show
a truthful temporary-failure page with an ordinary retry link; they cannot become
an unpublished fixture or a false 404. Prompt 036 accepts the bounded API history
query parameters on this same canonical page; see [revision history](revision-history-page.md).

Initial HTML includes names, EAT kickoff, all four available/unavailable markets,
selected probabilities, source labels, explanation and score/outcomes. Styled
components deliver CSS before content. Unique titles, descriptions, canonical URLs
and social metadata use the service identity and bundled 1200×630 brand preview.
Pages remain `noindex, follow` under the existing prelaunch policy; 042 owns launch
indexing and structured data.

## Prediction and result contracts

- Read every market from `snapshot`, never fill an unavailable family from
  `fixture.forecast` or another revision. Show the applicable current revision
  while open, the locked revision after closure, or an explicit closed-without-lock
  state. Void cycles keep the public reason even without a locked prediction.
- Match result appears first, followed by the other three market families. Shared
  probability labels preserve group rounding and boundary labels. Native
  disclosures expose alternatives without adding outcome badges. Double-chance
  overlap is explained. Each family identifies AI or API-Football fallback,
  provisional status, the whitelisted fallback reason and original publication.
- Keep source generation/retrieval/update, evidence cutoff, generation completion,
  publication, lock, observation and sync times separate. Unknown times stay
  unknown. Show limited-news, partial-coverage and delayed/retained refresh states;
  publication or page-read time never establishes fresh evidence.
- Display two to four original supported reasons and one uncertainty when the
  service permits analysis. Withheld or absent analysis remains explicit, with
  available probabilities retained. React renders external summaries as text;
  the HTML boundary reuses the resolver's offline HTTPS rules and suppresses
  unsafe/unattributed citations. Permitted source links expose independent
  publication, retrieval and update clocks in a native disclosure.
- Actual live or verified regulation scores remain separate from selected-pick
  outcomes. Show pending, correct, incorrect, unavailable and void independently
  per family, with original public explanations and settlement/correction/void
  clocks. A score never determines a badge in the page. Historical locked content
  stays useful after the forward window and after source permissions expire.
- Exact-score prediction remains excluded by the recorded launch decision and
  disabled public policy. Displaying an actual regulation score does not enable it.

`MatchDetailPage`/`MatchDetail` compose the read-only revision history below the
primary match content. The optional `history` slot remains available for reuse.
Shared team rows retain native reserved logos, broken-image initials and square
controls. All public reads remain anonymous and cannot generate predictions,
call providers, dispatch jobs or settle outcomes.

## Verification and handoff

`npm run test:detail-page` covers query/identity preflight, clock/error handoff,
whole-snapshot market isolation, source-link safety and metadata. The existing
SQL detail suite captures genuine open, locked, void, partial, fallback, linked
evidence, settlement/correction and historical projections. Its linked evidence
URL is an explicitly synthetic attribution and is never fetched.

`npm run test:detail-page:rendering -- --serve` builds an isolated production app
from those SQL projections and the feed pagination fixtures. It uses the real
detail route factory with only the stored reader injected. Case routes and
synthetic long-name/link/coverage/failure variants exist only in this test app.
For UI-only iterations, `--reuse=.tmp/match-feed-ID` reuses projections beneath a
validated owned temporary directory with a successful SQL log; it does not rerun
or claim a new database test. Normal runs always prepare fresh MySQL fixtures.

Browser acceptance checks initial content, disclosures, keyboard use, mobile/zoom,
broken logos, unsafe URLs and real-detail Back navigation from a filtered
three-page feed. This completes 034's real-destination handoff. No migration or
live provider/model/rights/hosting gate changes are introduced.
