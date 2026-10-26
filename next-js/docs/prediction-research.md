# Optional attributable research

The production code supports the optional `brave-search` provider through
`live-research.ts`, `createResearchEvidenceAdapter`, the durable research cost
ledger and the existing HTTPS/public-IP source fetcher. OpenAI probability
generation still uses no tools. Research is separately collected before the
immutable analysis cutoff; an enabled AI model does not itself search.

Keep `GOAL_HINT_RESEARCH_ENABLED=false` unless this account and source policy are
approved. Optional configuration is:

| Setting | Meaning |
| --- | --- |
| `GOAL_HINT_RESEARCH_ENABLED=true` | Enable the reviewed optional binding. |
| `GOAL_HINT_RESEARCH_PROVIDER=brave-search` | Use the supported Brave Web Search endpoint. |
| `RESEARCH_API_KEY` | Private Brave Search subscription token; never public or committed. |
| `GOAL_HINT_RESEARCH_HOSTS` | Comma-separated exact authoritative club, competition or trusted publisher hosts, maximum 16. No subdomain wildcard. |
| `GOAL_HINT_RESEARCH_LICENSE_REF` | Existing owner register approval covering search, original-source retrieval, summary retention/reuse and AI transmission. |
| `GOAL_HINT_RESEARCH_MONTHLY_BUDGET_USD_CENTS` | Separate approved capped research budget; AI usage-based billing does not remove it. |
| Existing job request/time limits | Must fit AI plus research with the complete baseline/publication reserve. |

The existing evidence, freshness, budget, football, release and AI transmission
approvals still apply. Configuration strings grant no permissions on their own.
Baseline readiness checks mandatory football/publication approvals independently.
Missing AI calibration/transmission approvals disable paid AI; missing research
approvals disable research. They do not disable an otherwise authorized baseline.
Missing research credentials, an unsupported provider, absent source hosts or
unverified optional license deactivate the capability; no search is made.
Research runs only with a usable configured AI runtime. Structured baseline
football evidence remains available with AI disabled.

The reviewed binding budgets one billed search, up to four search results and at
most two original article requests. It allows no redirects or implicit retries.
The category reserves 15 seconds including network work, with a request timeout
of 14 seconds; each source fetch is bounded by 4 seconds, 262,144 bytes and public
DNS/IP restrictions. Search JSON is capped at 131,072 bytes. The reviewed list
price is $5 per 1,000 searches ($0.005 each); actual account plan/invoicing must be
verified before activation. Free credits are never assumed in reservations.

Only original fetched article paragraphs or article-body metadata can become
evidence. Search descriptions/snippets are discarded. A source must have an exact
approved HTTPS host, no query parameters, parseable Article/NewsArticle/SportsArticle
JSON-LD publication time, a relevant canonical team name and football context.
Articles older than three days, future publication/update clocks, unknown dates
and unrelated teams are excluded. Modified-at dates remain separate from
publication. Excerpts are bounded to 450 characters and are retained verbatim as
inert data. Explicit uncertainty/rumor wording stays unknown. Source URL, publisher
host, title, publication/update time, retrieval time and exact used excerpt are
persisted. Identical excerpt hashes group syndicated copies rather than treating
them as independent confirmations.

This deliberately bounded parser does not cover every website, article format,
team alias, language or factor. It cannot establish pitch condition from a venue
name, weather from a different place/time, or complete squad fitness from missing
reports. Fetch failures, unsupported markup, missing optional news or an exhausted
research budget preserve the structured evidence and baseline path. Shared
evidence validation can accept sufficient structured context with limited news.
The model must cite supplied fact/source tuples; uncited memory and fabricated
citations fail the normal predictor validators.

The preparation stage seals the sources and a research status/reason before
analysis. An absent configuration records `unconfigured`; an accounted search
with no usable articles records `no-qualified-articles`. Replay reuses those
sources and original clocks without another search or article request. Paid
search usage and uncertain liabilities remain in the category ledger even when
no article qualifies. New research affects only a new permitted revision.

The official [Brave endpoint documentation](https://api-dashboard.search.brave.com/api-reference/web/search/get)
and [pricing page](https://api-dashboard.search.brave.com/app/plans) were reviewed
for request shape, authentication, result limits and list pricing. Official
[OpenAI tools documentation](https://developers.openai.com/api/docs/guides/tools-web-search)
confirms tools require explicit API configuration; this implementation keeps the
existing independent model contract and supplies separately verified research.
No real research credentials, licensed payloads or paid calls were used to verify
this implementation. Actual account support, source coverage and licenses remain
activation checks, and synthetic tests establish no prediction accuracy.
