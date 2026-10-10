# Methodology and measured performance

`/en/how-it-works` is a server-rendered English information page. Footer navigation,
Results and detail probability help link to it. Sections explain probabilities
and provisional estimates, source limitations, AI priority and validated fallback,
the daily seven-day EAT schedule, original clocks, publication cutoff, regulation
settlement, immutable picks, history and audited corrections.

The performance form uses native GET navigation and works without JavaScript.
Market, inclusive EAT dates, source and optional model/provider version share the
existing bounded API query contract. Blank optional native form fields normalize
to absence; duplicate/unknown parameters and incompatible filters fail before
storage. The resolved dates are pinned on submission. Defaults remain today and
the preceding 29 days, resolved on the server in EAT.

## Shared stored reader

`readPublicPerformance` binds the same competition scope, MySQL response cache
and service for the page and `/api/performance`. There is no loopback HTTP fetch,
browser aggregation, public provider request, evaluation run or job dispatch.
The page validates the returned schema and exact period/filter identity. A read
failure retains the methodology and selected valid controls, with a same-query
retry link; it cannot become a zero-fixture report.

The public reader continues to bind **no evaluation policy**. OP-16/OP-17 remain
unapproved. Counts are factual; hit rate, Brier/log loss and calibration remain
withheld. No minimum sample, quality threshold, confidence parameter or operating
approval is invented. A future approved binding still goes through the existing
service's scope, sample and quality gates. Passing diagnostics permits only
provisional descriptive statistics, not independent qualification or claims.

## Presentation and audit links

Every family reports explicitly labeled combined, AI and API-Football fallback
cells. Each cell preserves cohort, available, settled, pending, unavailable, void,
filtered-out and source counts. Its scoring denominator and correct/incorrect
counts remain visible when rates are withheld. Source-filtered unavailable/void
records cannot be assigned a source. Families/source/horizon cells overlap and
are never summed into extra fixtures.

Available metrics include their denominator and approved minimum. Score context
explains comparable markets/horizons and double-chance overlapping binary-event
scoring. Horizon bounds use cycle kickoff minus locked publication; horizon
coverage includes only known locks. Calibration disclosures use labeled semantic
tables, approved fixed bands, event counts, actual confidence Z and Wilson
intervals. Empty bands have no estimated frequency or interval. On narrow screens
the table retains readable column widths in a named keyboard-scrollable region.

Version disclosures show stored provider/model/calibration artifact identifiers.
Evidence lists contain bounded references to all available locks in service
order, with shown/total counts, original publication/evidence clocks and exact
revision-specific canonical match-page links. These are not selected favorable
examples. The performance projection adds `matchLabel`/`pageHref` alongside the
existing API evidence URL; its cache key uses projection 2 so older payloads are
not reused. SQL acceptance reconciles each page link to the detail service.

Historical void/postponed cycles and failed/delayed refresh attempts remain
separate operational measures. Corrections show the stored last-corrected time;
unsettled corrections remove stale outcomes before resettlement. No locked pick
changes and no historical revision is selected for its success.

## Public policy and release blockers

The user explicitly chose to keep correction/dispute ownership unresolved during
038. OP-25 remains a **release blocker**: a responsible owner, intake channel,
review/evidence process and any approved response commitment have not been
supplied. The page states submissions are not yet available. The implemented
audit mechanics are described separately; no contact details, response time or
operational dispute policy is fabricated. Prompts 040–041 consume the eventual
owner-approved facts; this prompt does not implement those pages.

API-Football by API-Sports is attributed with its official provider link;
individual news sources remain attributed on match pages. This supplies no new
source rights or approval. Independent quality evidence, rights, budgets,
worker activation, hosting and production release remain separate gates. The
existing `noindex, follow` policy is retained, with the canonical methodology URL
on goalhint.com. Broader launch SEO belongs to 042.

## Verification

- `npm run test:methodology` exercises page validation, default/EAT periods,
  exact stored count/gate preservation, sanitized failures and locked links.
- Genuine MySQL performance acceptance captures mixed/empty/small/gated/filtered
  and corrected reports, compares canonical links, blocks writes/network and
  compares jobs, locks, audit/results and fixture versions before/after reads.
- `npm run test:methodology:rendering -- --serve` prepares those SQL captures and
  builds an isolated production app. `--reuse=.tmp/methodology-ID` reuses a
  successful non-skipped SQL run. Synthetic policies/label variants exist only in
  this ignored acceptance app. Browser checks use the Playwright skill/CLI;
  artifacts belong under `output/playwright/038-*`.
