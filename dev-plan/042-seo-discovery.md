# 042 SEO and crawlable discovery

**Feature:** Consistent canonical discovery and indexing controls for public pages.

**Depends on:** [034-pagination-navigation.md](034-pagination-navigation.md), [036-revision-history.md](036-revision-history.md), [038-methodology-performance.md](038-methodology-performance.md), [041-contact-page.md](041-contact-page.md).

**Source:** [App specification](../app-write-up.md), sections 1, 6, 12, 13 and 15.

## Prompt

Read `dev-plan/000-index.md`, the source sections, brand guide and existing route/metadata code. Implement the site's canonical metadata and discovery layer using the installed Next.js metadata APIs. Use `https://goalhint.com` as the production metadata base and canonical origin, “Goal Hint” as the site name and “Goal Hint | Daily Football Predictions” as the homepage title. Give useful unique match/page titles and descriptions, with Goal Hint as the match-title suffix. Reuse named first-party favicons and social artwork from the brand kit.

Ensure `/` redirects consistently to `/en`; configure the application/deployment seam for `www` to the canonical origin. Redirect stale match slugs to the fixture-ID-based canonical page. Known unavailable fixtures remain valid pages; unknown fixtures return an actual 404. Keep historical match pages and their forecasts/results discoverable through dated archive, pagination and detail links.

Generate a sitemap containing only valid canonical pages and suitable last-modified values from meaningful content changes. Apply `noindex` to search, arbitrary filter and revision variants while allowing crawlers to read that directive. Canonicalize revision variants to the match page. Do not block those URLs in robots.txt in a way that prevents their noindex from being read. Maintain appropriate canonical treatment for genuine pagination pages; do not collapse all archive content into the first page.

Set English `lang` and preserve locale infrastructure without exposing empty locales or a language selector. Add only supported structured data whose fields match visible content; do not invent ratings or promise rich results, traffic or rankings. Keep staging indexing disabled through environment-aware controls that cannot leak into production configuration.

## Acceptance checks

- Inspect rendered titles, descriptions, canonicals, social assets, redirects and 404 status codes.
- Crawl archive/pagination links and validate sitemap membership plus filter/revision indexing exclusions.
- Verify metadata and meaningful match content without JavaScript.
- Check production/staging origin and robots behavior using controlled environment configurations.

## Handoff

Update `docs/development-progress.md` with changed files, checks/results and blockers. Record SEO/canonical decisions in `docs/implementation-decisions.md`.
