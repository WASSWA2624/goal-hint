# SEO and crawlable discovery

Prompt 042 implements local metadata, canonical discovery and indexing controls.
Public indexing and deployment remain unapproved. No search submission, Search
Console setup, visitor analytics or production hosting change is included.

## Canonical pages and metadata

`publicPolicy.origin` fixes the metadata base and canonical origin to
`https://goalhint.com`. Request hosts and preview URLs never supply it. Root
navigation redirects permanently to `/en`. The application configuration also
redirects `www.goalhint.com` to the canonical HTTPS origin, preserving path and
query. Actual DNS, certificates and hosting rules still belong to deployment.

Known campaign/click attribution parameters (UTM and Google, Meta and Microsoft
click IDs) redirect permanently to the same clean page URL. Shared/search links
therefore reach the feed or match instead of failing strict query validation.
Filters, pagination, revision history and repeated functional parameters are
preserved; unknown application parameters still receive the existing validation.
This normalization stores no attribution and adds no analytics. The API remains
outside the page proxy and retains its strict input contract.

Shared `pageMetadata` supplies complete page-specific Open Graph and Twitter
fields because Next metadata objects merge shallowly. The homepage title is
`Goal Hint | Daily Football Predictions`; archive titles include the EAT day and
pagination number; match titles include the teams, known kickoff's EAT date and
Goal Hint suffix. Dates distinguish repeat fixtures between the same clubs without
inventing a kickoff when none is stored. Existing
named first-party favicon, touch icon and 1200 × 630 social PNG assets are reused.

`createFeedRoute` shares its stored read and request-owned reporting clock between
metadata and meaningful initial HTML. Dated collections and pagination keep their
own canonical identities. For example, `/en?page=2` canonicalizes to
`/en/predictions/YYYY-MM-DD?page=2`, never to page one. Relative date aliases pin
to the corresponding dated collection; the ordinary home page stays `/en`.
Match metadata shares the fixture read with its page; only page rendering reads
optional section insights, in parallel with that fixture read. An insights retry
or slow insights query cannot hold up the canonical/title metadata.

Search, league/status/market/probability-order filters, nondefault page sizes and
multiday collections receive `noindex, follow`. Their normalized canonical retains
the actual query rather than claiming to be an equivalent unfiltered page.
Empty, failed or out-of-range feed content is not made indexable. Information
page query variants also receive noindex. Revision/history variants canonicalize
to the fixture's main detail page and receive noindex. `robots.txt` allows these
HTML URLs to be read; only `/api/` is disallowed.

Fixture IDs remain the identity authority. Existing permanent redirects update
stale slugs, retaining revision parameters and the revision-history target. Known
fixtures with unavailable forecasts remain valid pages; unknown fixture IDs and
invalid dates return actual 404 responses. Ordinary archive, previous/next page
and detail anchors work without JavaScript. English `lang` and locale fallback
remain in place, without a language selector or untranslated alternate URLs.

## Stored sitemap discovery

Native dynamic Next metadata routes expose `/sitemap.xml`, match shards at
`/matches/sitemap/N.xml`, archive shards at `/archive/sitemap/N.xml`, and
`/robots.txt`. Robots lists every populated shard; no unsupported sitemap-index
serialization or fixed recent-day window is introduced.

`createDiscoveryReader` uses the same public fixture predicate as the feed:
configured API-Football competitions plus retained closed/void historical
forecasts. It never fetches a provider or generates predictions. Repeatable-read
queries produce counts and ordered shards of at most 2,000 URLs. Invented shard
IDs are rejected before a large OFFSET scans the cohort; malformed IDs and absent
nonzero shards return 404. SQL failures propagate rather than fabricating an
empty successful public inventory.

Match URLs use stored team identity and fixture IDs. Their last-modified value is
the latest fixture creation, material fixture audit or public prediction-change
event. Retrieval-only sync timestamps and the current request clock are excluded.
Date archives require an actual stored kickoff/EAT day. They advertise page one;
ordinary links expose subsequent pages, each with its own canonical. Search,
filters, revisions, guessed empty dates and unknown fixtures never enter the XML.
Static pages and date archives omit lastmod because no reliable consolidated
content-change stamp exists. No daily fabricated timestamp substitutes for it.

## Indexing and release gates

`GOAL_HINT_DEPLOYMENT_ENVIRONMENT` classifies a request as development, staging or
production. Missing, misspelled and unknown classifications disable indexing.
`NODE_ENV=production` alone cannot distinguish staging from production and cannot
enable indexing. Classification is read at request time; dynamic metadata routes
and locale metadata prevent a staging build's decision from freezing into the
production artifact. The runtime environment contract recognizes the new field
without granting provider/publication capabilities.

The source-owned `discoveryReleaseApproval` is currently `{ verified: false,
evidenceRef: null }`. Privacy and terms retain `releaseReady: false`. Contact is
available and ready, using the owner's confirmed public email.
Both verified release approval and all three publication gates are required in
addition to production classification/runtime. No environment value or provider
approval reference replaces these facts. All current HTML responses therefore
retain noindex through metadata and the proxy's `X-Robots-Tag`, and discovery XML
contains no public URLs. Robots does not advertise those empty prelaunch maps.

OP-25/27/28, source/public redistribution rights, forecast qualification and prior
operational release decisions remain unresolved. Prompts 048–049 must review
actual evidence and deliberately integrate the verified release/publication facts
before indexing or deployment. This feature adds no switch that silently bypasses
those decisions. Noindex is a crawl directive, not access control or a deployment
lock.

### Owner details needed to finalize publication

The current defaults are English, `https://goalhint.com`, free account-free access,
no betting or payments, disabled advertising/browser analytics, and provisional
forecast labels. Browser preferences/navigation storage and direct third-party
team-logo requests already exist. Hosting logs and recipients still need actual
deployment facts. The recorded local provisional forecast approval does not
authorize hosted release or public indexing.

Complete the following with facts or mark an item unknown; do not supply passwords
or API keys. These answers are enough to prepare final wording for review; existing
lawyer-written policies are not a prerequisite. Applicable legal requirements can
then be checked against the actual operator, audience and processing arrangements.

- **Operator/audience:** Wilson Wasswa confirmed
  on 12 October 2026 that he operates Goal Hint from Uganda for English-speaking
  football fans worldwide aged 18 or older and handles support, corrections and
  privacy requests. The public domain is `goalhint.com`.
- **Contact/process:** Publish `wasswawilon0002@gmail.com` exactly as supplied.
  Wilson Wasswa handles questions, privacy requests and corrections. The existing
  report guidance asks for the match URL, issue and supporting public evidence;
  no response deadline is promised. The mailto link adds no mail-sending backend.
- **Privacy/operations:** The database will run on the public Namecheap hosting
  server. The owner explicitly reports its country and actual log/backup
  retention as unknown. The earlier answer "daily" is not treated as a retention
  period. Confirm processing location, collected logs, access/recipients,
  retention/deletion and backup settings before completing the notice. Visitor
  analytics, advertising and affiliate promotions stay disabled for launch by
  the owner's explicit choice. Voluntary contact emails use Gmail (Google);
  retention and deletion of correspondence also need an actual policy.
- **Terms/rights:** The owner confirmed permission for public API-Football data
  and logo display; this records the owner's statement, not independent contract
  verification. [API-Football's terms](https://www.api-football.com/terms) place
  responsibility for necessary publication/visual-asset permissions on the user.
  The owner permits unrestricted reuse of Goal Hint's original material; this
  does not relicense provider data, logos or other third-party material.
- **Publication/release:** Planned launch/effective date: **1 November 2026**.
  This is a future target, not a claim that incomplete notices are effective.
  Confirm final hosting/privacy facts and the actual production deployment's
  domain/DNS/HTTPS and readiness before recording verified indexing approval.

Once those facts are verified, update the public privacy/terms/contact wording,
effective dates and real contact destination together with their publication
records. Then record the applicable release evidence and verify production HTML,
robots and sitemaps before enabling discovery. Flipping readiness booleans alone
would leave the visible prelaunch notices and unresolved operational facts intact.

The only structured data is the supported `WebSite` identity on the plain home
page, matching the visible brand, English locale and canonical home URL. JSON-LD
escapes `<` before embedding. No operator, rating, sports-event claims, search
action, ranking or rich-result promise is invented.

## Verification and evidence

- `npm run test:seo` covers environment/approval boundaries, canonical variants,
  social metadata, unavailable states, bounded sitemap controllers and genuine
  MySQL discovery. Set `MYSQL_TEST_SERVER_BINARY` to a genuine MySQL server binary;
  the helper owns an isolated loopback instance and never uses an installed
  service. Missing MySQL does not count as passing integration acceptance.
- `npm run test:seo:rendering` prepares stored SQL projections, builds an isolated
  app using the actual production route factories and native metadata routes,
  then checks staging and synthetic approved production against the same build.
  Synthetic release evidence exists solely inside `.tmp` acceptance code. It is
  not production approval, live provider data or a production configuration path.
- The 12 October 2026 SEO review passed **22 targeted unit checks**, a fresh
  genuine MySQL discovery capture, and **28 staging / 64 synthetic production
  HTTP/HTML checks**. All 35 stored match destinations render even when optional
  insights throw synchronously; campaign redirects preserve pagination/history.
  Unit coverage also verifies distinct rematch metadata across the EAT midnight
  boundary. The fixture's production build, TypeScript and focused lint passed.
- Final optimization verification passed the full application test suite,
  lint, production build and **32 browser checks**: server-rendered pagination,
  unique direct-load canonical metadata, all four prediction markets, no
  horizontal overflow at 320/390/1280 pixels, lazy section loading, cache reuse,
  and live detail refresh without browser errors. Remote resources were blocked;
  interaction endpoints used captured fixture data. Captures and the browser
  harness are in ignored `output/playwright/seo-*`; fresh SQL evidence is in
  `.tmp/seo-capture-optimization`, and final rendering evidence is in
  `.tmp/seo-4f88f593`. See `live-client-refresh.md` for measured bundle changes.
- JavaScript browser review found the open [Next.js initial metadata hydration
  race](https://github.com/vercel/next.js/issues/97472#issuecomment-5653284177)
  on the installed Next 16.4.0: immediate client navigation after the initial load
  can retain the previous route's title, description, canonical and Open Graph
  URL. Direct HTTP renders contain one correct metadata set; navigation after
  initial hydration also contains one correct set for Chrome and Bingbot user
  agents. The issue persisted with blocking bot metadata; no stable framework
  patch was available at review time.
- `MetadataRecovery` now handles the observed race while retaining the native
  Metadata API. After client navigation only, it checks singleton title,
  description, canonical and Open Graph URL tags and observes later head
  insertions. Duplicates trigger one ordinary reload of the current destination;
  this replaces the current history entry without changing React-owned nodes.
  Correct client navigations, in-page interactions and initial document loads
  do not reload. The original document URL comes from the browser's Navigation
  Timing entry, so detection also works if a link hydrates before the guard.
  Returning Back to the initial URL remains covered. A fresh document resets the
  guard, preventing a recovery loop. No timers, storage, framework internals or
  dependencies are added. The tradeoff is one extra document request when the
  framework race actually occurs; this is an application recovery, not an upstream
  framework fix.
- Follow-up verification passed the final application production build, lint,
  TypeScript, complete unit suite, six script tests, eight recovery lifecycle
  unit tests, and **92 staging/synthetic-production HTTP checks**. The updated
  privacy/terms/contact HTML checks also pass against the actual production build
  with indexing still gated, including fixed-email/query-injection isolation and
  the new Gmail correspondence disclosure.
  Four Chrome/Bingbot browser cases at 4x CPU throttling verify that early
  navigation recovers once, hydrated navigation remains within the same document,
  and Back/history are preserved. A separate browser case verifies normalized
  query URLs, returning Back to the original document URL, one-shot recovery and
  absence of reload loops. **32 existing interaction/responsive checks** and
  **18 policy-page layout checks** pass without page errors or horizontal
  overflow. Contact at 320 pixels and terms at 1280 pixels were visually checked.
  The acceptance fixture is `.tmp/seo-66f18d84`; browser evidence is in ignored
  `output/playwright/metadata-recovery-*`, `seo-blockers-final-browser.js` and
  `policy-final-browser.js`. Head ownership is inspected only by the browser
  diagnostic to distinguish real hydration from arbitrary elapsed time; the
  shipped recovery uses public browser APIs exclusively.
- The checked run used MySQL Community Server 8.4.11: material rename versus
  retrieval-only sync, stable fixture identity, locked historical retention,
  stored feed/detail projections and absence of provider work passed. XML crawling
  verified all 35 fixture destinations, actual lastmod values, the dated archive,
  pagination links, indexing exclusions, first-party assets, redirects and 404s.
- Controlled HTTP checks: **24 staging and 60 synthetic production checks passed**.
  A staging-built artifact was restarted with production classification to verify
  request-time behavior. Node fetch ignores a custom Host header, so the www check
  uses Node HTTP to exercise the real redirect seam without external requests.
- Chrome through the Playwright skill/CLI: **69 checks passed without JavaScript**,
  including all 35 linked fixtures, keyboard skip/pagination/detail navigation,
  browser Back, canonical metadata, unavailable/revision/search content, true 404,
  320/390/1280 widths, English content under French locale/Los Angeles timezone,
  and no visitor cookies/API polling/non-GET requests/page errors. Remote resources
  were blocked in the isolated browser. Desktop archive and mobile match captures
  were visually reviewed; square shared components and readable content remain.

Logs are ignored `.tmp/042-*`; SQL capture evidence is
`.tmp/seo-capture-042/database.log`; browser scripts/screenshots are ignored
`output/playwright/042-*`. Production metadata, stylesheet and HTML checks also
pass for navigation, privacy, terms and contact. See the progress record for the
final static/build/unit results. Owned test servers and browser contexts are
stopped after acceptance.

Implementation follows the installed Next 16 metadata APIs and the primary
guidance for [pagination and canonical URLs](https://developers.google.com/search/docs/specialty/ecommerce/pagination-and-incremental-page-loading),
[meaningful sitemap lastmod](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap),
and [safe JSON-LD embedding](https://nextjs.org/docs/app/guides/json-ld).
