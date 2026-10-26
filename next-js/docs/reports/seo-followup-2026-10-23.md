# SEO follow-up — 23 October 2026

Branch: `codex/seo-optimization`. Scope: `prompts/seo-optimization.md`.
This follow-up builds on the [earlier audit](seo-audit-2026-10-23.md), whose
pagination, metadata and discovery fixes were already present in `main`.
Changes are local and reversible; no deployment or database migration is required
to review them.

## Current live evidence

Fresh anonymous GET requests at approximately **22:45 EAT** confirmed HTTP 302
redirects to `/cgi-sys/suspendedpage.cgi` on the apex homepage, www homepage,
`/robots.txt`, `/sitemap-index.xml` and the fixture API. Captures:
`.tmp/seo-followup-2026-10-23/live-before.json`. The existing read-only production
smoke command also fails with its explicit hosting-restoration diagnostic.
A final homepage recheck at approximately **23:04 EAT** still returned the same
302 suspension redirect; see `.tmp/seo-followup-2026-10-23/live-after.json`.

The hosting operator must restore the account before live SEO acceptance can
pass. These responses do not establish whether the database contains current
fixtures, whether workers are running, or whether predictions have been lost.
Live rendered content, canonical delivery, sitemap coverage and mobile performance
remain unverified. No production performance or ranking improvement is claimed.

## Implemented changes and before/after evidence

| Area | Before | After |
| --- | --- | --- |
| Mobile original analysis | The server rendered stored analysis, but phone hydration removed the collapsed panel's children. Reasons, risk and citations then required interaction to appear in the DOM. | The existing hidden accordion retains its children, so available stored content remains in the document when collapsed. Subscriber access controls still apply before rendering. |
| Shared detail sections | Collapsing unmounted the section subtree, including available stored previews and publication history. | The reusable `SectionCard` hides the existing panel. Insight requests still depend on the selected section; retaining markup does not enable closed-section requests. |
| Keyboard collapse | Focus restoration assumed collapsed descendants had been removed. | Collapsing also restores focus when the active element belongs to the retained hidden panel. |
| Production metadata/content checks | Correct canonical and robots tags could let an HTML shell with no title or main heading pass. | Verification requires one nonempty document title and one server-rendered main heading; JavaScript strings and inert templates do not supply them. SVG titles remain valid without counting as document titles. |
| Production sitemap checks | Descendant `loc` extraction could ignore malformed entries or accept duplicate, foreign-origin, query, fragment, private or unpublished destinations. | Verification checks XML root/entry namespaces, unique locations, the canonical HTTPS origin, clean URLs, publication/private exclusions and required landing-page membership. |
| Access/indexing regression | Full and free forecast eligibility was covered indirectly by separate tests. | An explicit regression compares published, empty and missing forecasts across scheduled/finished and full/free projections, checking canonical identity and history exclusion. |

Keeping equivalent content in mobile accordions follows Google's
[mobile-first indexing guidance](https://developers.google.com/search/docs/crawling-indexing/mobile/mobile-sites-mobile-first-indexing).
The sitemap checks enforce this project's existing canonical inventory contract,
consistent with Google's [sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap).
The smoke check is bounded sampling of destinations, not proof that every live
match page contains sufficient original analysis.

## Other audited areas and unresolved blockers

- Canonical URLs, rolling pagination, noindex filters, stored sitemap selection,
  factual structured data, revision provenance and server-rendered detail routes
  already have implementation and tests. No artificial analysis, accuracy,
  fixtures, outcomes or structured-data claims were added.
- English is the sole published language. Existing locale fallback remains
  appropriate; real translated content is needed before language alternatives
  can be published. See Google's [localized-version guidance](https://developers.google.com/search/docs/specialty/international/localized-versions).
- Best Slips deliberately returns an unavailable state pending qualified odds and
  model inputs. The homepage's existing match navigation remains available.
  This SEO change does not activate providers or manufacture slips to fill it.
- Anonymous access to paid predictions remains governed by the existing product
  policy. Mobile retention preserves that policy and cannot make withheld
  original analysis publicly indexable.
- Privacy/terms operating facts and their publication controls remain as recorded
  in the existing policy documents. Search Console verification/submission and
  production hosting changes require the appropriate owner account.

## Validation

The commands, outcomes and local evidence paths below describe this branch only;
earlier report counts are historical evidence.

- Initial targeted SEO/navigation/detail/history/pagination run: **55 passed**,
  zero skipped. The new forecast/access regression also passed independently.
- Python regression suite after smoke-check changes: **39 passed**. Evidence:
  `.tmp/seo-followup-2026-10-23/python-tests.log`.
- Running the final 13 production-verifier regression tests against the original
  script reproduced **23 failing subcases**: the old verifier accepted invalid
  metadata/sitemaps that the new tests require it to reject. All 13 tests pass
  against the updated script. Evidence:
  `.tmp/seo-followup-2026-10-23/regressions-before.log`.
- Full Node unit run with two concurrent files: **1,728 passed, one failed, one
  skipped** (1,730 total). `tests/database-cli.test.mjs` exceeded its existing
  60-second subprocess timeout while generating Prisma. This run is not reported
  as clean. Evidence: `.tmp/seo-followup-2026-10-23/node-tests.log`.
  A separate retry reproduced the same generation timeout; it was not resolved
  by this SEO change. Evidence:
  `.tmp/seo-followup-2026-10-23/database-cli-retry.log`.
- `npm run typecheck`: **passed**. Evidence:
  `.tmp/seo-followup-2026-10-23/typecheck.log`.
- Whole-application `npm run build`: **passed**, including TypeScript and route
  generation. Evidence: `.tmp/seo-followup-2026-10-23/build.log`.
- Whole-repository `npm run lint`: **passed with zero warnings**. Evidence:
  `.tmp/seo-followup-2026-10-23/lint.log`. `git diff --check` also passed.
- **33 focused content tests passed**. Fresh genuine MySQL detail integration
  passed **11 nested cases**. A separate feed integration setup timed out during
  its existing `database.py deploy` subprocess; that run is not counted as a pass.
- **17 stored detail HTML scenarios passed**, plus fixture-derived canonical
  metadata, stale-slug 308 redirect and unknown-fixture 404 checks. Final captures
  are under `.tmp/seo-content-9fb6389c/` and include
  `detail-linked-evidence.html`. The isolated rendering app skipped its duplicate
  TypeScript pass after an initial harness timeout; the application's independent
  full typecheck and production build both passed. No tracked compiler setting
  was changed. A stale earlier capture was discarded in favor of fresh SQL data.
- The reusable Playwright CLI regression
  `scripts/verify-mobile-match-content.js` **passed at 390 and 320 pixels** against
  `/detail-cases/linked-evidence` in the isolated SQL-backed fixture: three retained
  analysis items (two reasons and key risk), two source links, equivalent history
  and publication record, zero unnecessary insight requests, correct toggle and
  keyboard focus behavior, and no 320-pixel horizontal overflow. The screenshot
  `output/playwright/seo-optimization/mobile-320-collapsed.png` was visually checked.
  Browser and owned Next/MySQL acceptance processes were stopped; the acceptance
  server port was verified closed.
- Live `python scripts/verify-production-seo.py`: **failed on the hosting
  suspension**, before reading application content. Evidence:
  `.tmp/seo-followup-2026-10-23/production-verification.log`.

## Hosting recovery and Search Console verification

1. Restore hosting and confirm anonymous apex/www requests reach the application,
   with www resolving to the existing canonical HTTPS apex origin.
2. Deploy the reviewed branch through the existing deployment workflow. Run
   `python scripts/verify-production-seo.py` against the restored production site.
   Investigate actual fixture/worker/database evidence if current coverage fails.
3. In the verified `goalhint.com` Domain property, use URL Inspection's live test
   for `/en`, `/en/matches`, a populated second feed page, a real date archive and
   a published match taken from the sitemap. Inspect rendered mobile HTML and
   resources, the canonical, indexing directives and retained available analysis.
4. Confirm filtered/history/private URLs remain excluded and unknown fixtures
   return 404. Confirm each populated feed page retains its own canonical URL.
5. Fetch the sitemap index and all advertised root-level shards. Submit
   `https://goalhint.com/sitemap-index.xml` in Search Console and investigate
   processing errors. Check applicable structured data with the Rich Results Test.
6. Request indexing for representative eligible restored pages. Review Google's
   selected canonical in indexed URL Inspection data; a live-test pass does not
   predict it. Monitor Page indexing and sitemap reports.
7. Obtain new mobile/desktop performance measurements on equivalent populated
   pages after restoration. Monitor Core Web Vitals with real traffic; this local
   change and synthetic browser checks do not establish field performance.

These steps follow [URL Inspection guidance](https://support.google.com/webmasters/answer/9012289)
and do not guarantee indexing or rankings.
