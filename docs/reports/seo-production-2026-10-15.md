# Production SEO release — 15 October 2026

The owner explicitly instructed: **“Fix all and deploy changes to production.”**
This authorizes publication of the public football pages and deployment of the
reviewed fixes. It supersedes the earlier prelaunch indexing hold. It does not
claim that incomplete privacy/terms operating facts have been verified: those
pages retain their draft status and their own noindex controls.

## Changes

- Keep the canonical landing URL and server-rendered navigation stable through
  hydration. Device-local dates remain available through an explicit choice in
  Filters, including a return to East Africa dates.
- Cache bounded, pure timezone validation/day-bound calculations; load the date
  calendar on demand. Preserve DST and non-hour-zone behavior.
- Publish eligible production pages and root-level sitemap shards under the
  owner's explicit release authorization. Staging, filters, empty archives,
  unknown fixtures and forecastless match pages keep their existing policies.
- Read performance cohorts in batches of 1,000, with one repeatable-read snapshot,
  a shared 16 MiB payload budget and a maximum total of 31,000 fixtures. Counts
  are complete; accuracy metrics still require their separate evaluation policy.
- Replace MySQL-only JSON casts with the root `JSON_EXTRACT` operation supported
  by both MySQL and MariaDB. Stored JSON integrity uses the same representation
  as each database's inserted document. Existing migration history is unchanged.
- Deploy a separate private worker runtime with existing credentials and owner
  approvals. A five-minute cron uses `flock` and a 270-second timeout, preserving
  database job leases and provider budgets. The web bundle carries no provider key.
- Retain the earlier redirect, sitemap, forecast-disclosure and mobile-grid fixes.

The prior PageSpeed baseline was mobile Performance **64**, SEO **69**, LCP
**4.8 s**, Total Blocking Time **740 ms**. Post-deployment measurements and actual
deployment identifiers are recorded below after verification; no score of 100 is
claimed in advance.

## Verification and deployment evidence

- Full unit suite: 1,402 passed, zero failures, one skipped (1,403 total).
- Repository-wide ESLint: passed with zero warnings. TypeScript passed.
- Genuine MySQL discovery and performance integration acceptance passed. The live
  runtime integration passed all 11 checks with zero skipped, covering the eight
  import dates needed for civil-day browsing, forecasts, result polling,
  settlement, enrichment and reserve accounting. Two older fixed-count assertions
  were updated to the existing eight-date manifest and its documented reserve.
- Built HTTP acceptance: 40 staging and 47 synthetic-production checks passed.
- Browser acceptance: 22 checks passed in Kampala, Los Angeles and Kathmandu,
  including hydration, local-date selection and return, lazy calendar opening,
  canonical metadata and widths 320/390/1280, with zero browser errors.
- Six Python script tests passed.
- The clean isolated cPanel build produced a 14.3 MiB bundle from application
  commit `6868fbf`. Its dirty marker reflects deployment documentation updates
  made during packaging; the tested application source matches that commit.
- Worker release `20261015163502-6868fbf` is active. Readiness passed against the
  actual provider account. Cron is installed and a subsequent invocation resumed
  successfully. Production changed from zero fixtures/data-unavailable to 167
  fixtures for 15 October, with new forecasts and result settlements observed.
- Canonical origin rules are installed in the domain's `.htaccess`; the prior
  file is backed up privately. HTTPS www paths now redirect directly to the
  canonical origin, preserving path/query. The host still forces HTTP to HTTPS
  ahead of those rules, so HTTP www can retain one extra upstream hop.

- Web release **`20261015164543-6868fbf`** was activated successfully, replacing
  `20261015063359-6cfb6d0`, which remains available for rollback.
- All **14 public production checks** passed with `scripts/verify-production-seo.py`:
  production home/archive/forecast indexing, exclusion variants, three populated
  root-level sitemaps, real 404s, current fixtures and the performance API. The
  performance response includes all **3,035 fixtures** and retains withheld
  accuracy numbers while the evaluation policy remains unapproved.
- All **22 browser checks also passed against the deployed site**, in Kampala,
  Los Angeles and Kathmandu, with zero page errors. `/en` remains `/en` through
  hydration, has one canonical and index/follow, and explicit local-date choices
  can return to the canonical reporting-day page.
- The public PageSpeed UI returned “Unable to resolve” for both the direct page
  and root URLs. The public API returned its daily-quota error. Those failures
  do not constitute a new score. An independent Lighthouse 13.5 mobile audit of
  the newly populated feed measured **44 Performance / 92 SEO**, FCP 3.6 s,
  LCP 5.0 s, TBT 980 ms, CLS 0.007 and 2,703 KiB transferred. This differs from
  the earlier empty-feed PSI baseline and is not a like-for-like comparison.
  The indexing audit passes. The robots audit timed out; direct retrieval returns
  HTTP 200 and valid rules, rather than a syntax error.
- That audit found 2,244 KiB of oversized badge downloads, including 90 KiB PNGs
  displayed at 18px. Follow-up changes load decorative team badges with a shared
  viewport observer and preserve direct provider delivery, initials and request
  privacy. The header SVG gets high fetch priority. The mobile date strip grows
  after user interaction instead of prepending 30 extra days during hydration.
  Observer lifecycle, cancellation and unsupported-browser fallback tests pass.
  Final deployment and repeat measurements are recorded after release verification.

Diagnostic output is kept under ignored `.tmp/seo-production/`; credentials are
never included in this report.

## Continued mobile performance work

The clean follow-up bundle from `2c0d168` was deployed as
`20261015172247-2c0d168`; `20261015164543-6868fbf` remains available for rollback.
All 14 live HTTP checks passed again. Its independent mobile Lighthouse run
measured **46 Performance / 92 SEO**, LCP **3.6 s**, TBT **2,060 ms** and
**1,019 KiB** transferred. Badge savings dropped from 2,244 KiB to 603 KiB.
This is a download/LCP improvement, not a claim that the performance target is met.
Another trace run reported 28 with an explicit page-load-timeout/incomplete-results
warning; it is not accepted as a completed measurement. Live browser navigation
also encountered slow resource delivery. No fresh passing browser result is claimed
for that release beyond the earlier production and current isolated checks.

The owner's follow-up asks to continue toward Performance 100. Profiling the date
strip found 5,408 timezone `formatToParts` calls for 32 labels/links, repeated on
each render. A bounded 512-day cache now shares immutable Kampala day boundaries
between labels, query validation and prediction windows. The historical timezone
search still runs for an uncached day. The same probe makes 900 lookups on its
first pass and 32 on subsequent passes; subsequent runtime fell from 31–47 ms to
2–3 ms on the local Node runtime. These are component-operation measurements,
not an inferred Lighthouse score. All 37 calendar/query-related tests pass,
including the new lookup-budget check. Mobile lists also use CSS content visibility
with remembered row sizes to defer offscreen layout while retaining the complete
server HTML. All 87 staging/production HTML acceptance checks pass after these changes.

The follow-up also limits device-timezone subscriptions to kickoff/publication
labels, so detecting the browser zone does not rerender every badge, probability
and card structure. The inverse header SVG is embedded from the original brand
artwork by the existing generator, removing the measured LCP image request.
The font remains self-hosted with `display: swap`; experimental framework CSS
inlining was not enabled.

Approved API-Sports team/league PNGs now use a bounded first-party badge route
through one reusable helper. Five retina sizes are supported; the route accepts
only known provider kinds/numeric IDs, fetches PNGs without redirects, limits
input bytes/dimensions and decoder time/memory, and uses Next.js route caching
with seven-day revalidation. Other approved hosts stay direct. The importer
remains URL-only and existing media approvals still apply. This follows the
provider's [logo caching guidance](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide);
it does not assert ownership of club marks. Privacy implementation facts were
updated; the legal-page publication gate remains unchanged.

The original standard Next image optimizer successfully returned a **1,374-byte**
WebP and cache HIT locally. Its hosted preflight then exposed a CPU constraint:
native Sharp requires x86-64-v2, and the supported Wasm fallback also failed
because this host lacks SIMD. No incompatible release was activated. The host's
ImageMagick 6.9.13-57 successfully encodes WebP, so the final badge route uses
that system codec on Linux and Sharp for local Windows tooling. Deployment
verifies conversion before activating the bundle. This avoids an obsolete Sharp
downgrade or unverified CPU override. Final cached-route checks and live
measurements are recorded below.

Before this hosting adjustment, all **87 HTML checks**, **33 browser checks** and
**6 Python checks** passed. The browser checks cover Kampala, Los Angeles,
Kathmandu, 320px, 390px and desktop layouts, explicit timezone round trips,
full-list scrolling, keyboard focus and all 30 match links without JavaScript,
with no page errors. The prior complete unit run passed 1,404 tests with one
existing skip. Further badge-route tests verify accepted inputs and decoder
bounds. The header artwork is present in initial HTML without an external
header-logo source.

The final cached badge route returns a **1,374-byte WebP**, with MISS then HIT;
the repeat request took **7 ms** locally. Invalid provider kinds, IDs and sizes
return HTTP 404. All **87 HTML checks**, **33 browser checks**, **21 targeted
unit checks** and **6 Python checks** pass after the hosted-codec adjustment;
TypeScript and source-wide ESLint also pass. Decoder checks cover oversized and
non-PNG upstream responses and real resized WebP dimensions. Production results
will be appended after deployment rather than inferred from local timings.

The owner's latest target is **mobile Performance above 90**, referencing
[the supplied PageSpeed run](https://pagespeed.web.dev/analysis/https-goalhint-com/kw9encp64u?form_factor=mobile).
The final cache check found Next.js persisted a returned HTTP 503 as a route
cache HIT, despite `no-store`. Badge fetch failures now reject the render so they
remain uncached and revalidation can retain a previously successful image.
Repeated failure requests return HTTP 500 without a cache HIT; initials remain
the browser fallback. Successful responses additionally set a seven-day public
browser cache. The final 87 HTML checks pass. Local provider retrieval later
encountered the bounded eight-second timeout; this is recorded as an upstream
failure, not a successful image check or an application-score estimate.
