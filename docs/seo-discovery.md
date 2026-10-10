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

Shared `pageMetadata` supplies complete page-specific Open Graph and Twitter
fields because Next metadata objects merge shallowly. The homepage title is
`Goal Hint | Daily Football Predictions`; archive titles include the EAT day and
pagination number; match titles include the teams and Goal Hint suffix. Existing
named first-party favicon, touch icon and 1200 × 630 social PNG assets are reused.

`createFeedRoute` shares its stored read and request-owned reporting clock between
metadata and meaningful initial HTML. Dated collections and pagination keep their
own canonical identities. For example, `/en?page=2` canonicalizes to
`/en/predictions/YYYY-MM-DD?page=2`, never to page one. Relative date aliases pin
to the corresponding dated collection; the ordinary home page stays `/en`.

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
evidenceRef: null }`. Privacy, terms and contact also retain `releaseReady: false`.
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
