# Read-only revision history

Prompt 036 expands history within `/en/matches/{fixtureId}/{slug}`. The primary
match content always uses an independent applicable-current/locked read. A
selected historical snapshot appears below it, inside an open native disclosure,
without another fixture card, score headline or performance entry.

The page accepts the detail API's existing `revision`, `cycle`, `limit`,
`revisionAnchor`, `revisionBefore`, `cycleAnchor` and `cycleBefore` parameters.
Inputs validate before storage. Malformed, duplicate, missing and cross-fixture
selections return the same safe 404. UUID establishes fixture identity. Permanent
redirects for changed slugs/uppercase UUIDs preserve the validated history query.
Metadata uses the canonical match URL without the query; all revision/history
views explicitly retain the existing prelaunch `noindex, follow` policy.

History uses ordinary server-rendered links, with no new client fetcher or state
store. This keeps complete snapshot and source-permission handling on the server
and works with JavaScript disabled. Reusable square `Disclosure` controls use
native expanded state, Enter/Space behavior and visible focus. Links target the
open history region; a summary link returns to the primary content. Next.js
prefetch is disabled for history selection/pagination/retry.

Each list is bounded to ten entries by default and twenty at most. Publication
order uses the persisted fixture revision; cycles use their persisted ordinal.
Selection and pagination links retain both high-water anchors, the page limit and
the other list's cursor. New publications cannot shift membership while browsing.
“Latest history” starts over with fresh anchors; browser Back returns to the
previous page. There are no offsets, inferred opaque-ID ordering, accumulated
client lists or unbounded historical snapshot rendering.

Publication summaries add only the persisted daily run's EAT date, distinct
AI/API-Football source kinds and safe cycle fields to the existing public DTO.
Current/locked/superseded/void labels follow recorded references and cycle state.
Cycle inspection shows the kickoff/cutoff and opened/closed/locked/void times
already exposed by the API, with its whitelisted void reason. Detailed schedule
audit records are not exposed by that API and are not invented here.

The selected snapshot reuses the primary page's market/probability/analysis/source
components with unique DOM IDs. Missing families stay unavailable; there is no
merge from current or older snapshots. Superseded selections do not gain result
badges or enter headline settlement. Historical locked/void outcomes retain only
their own cycle/revision binding. Source update times remain unknown when absent;
unsafe/expired citations and explanations use the existing safe-public boundary.

The request-scoped route cache shares reads with metadata. If the extra historical
read fails, the independent primary content and its available initial history
remain visible, together with an inline same-query retry. Missing references
remain genuine 404s. No current/locked references, results, settlement, cohorts,
jobs, provider requests or feed membership are changed by selecting history.
The existing shared response cache may maintain its own envelopes as before.

`npm run test:history-page` checks query/link/error/label contracts.
`npm run test:history-page:rendering -- --serve` prepares genuine isolated MySQL
projections and builds the production route with an injected stored reader for
HTML and browser acceptance. `MYSQL_TEST_SERVER_BINARY` may point at an existing
local genuine MySQL binary; tests create an owned loopback datadir and never use
an installed service. UI-only `--reuse=.tmp/match-feed-ID` requires a successful
owned SQL capture. Test scenarios and injected failures never enter production.

Prompt 037 refreshes the applicable main forecast through a client boundary while
retaining this server-rendered history subtree. History read times label its
current/locked/cycle statuses; latest-history navigation refreshes the anchored
view explicitly. Historical selections never enter the live current-data merger.
