# Privacy page and data-flow review

Prompt 039 implements `/en/privacy` in the existing information/public shell.
The English page is server rendered, has section anchors, readable shared
typography and square components, and retains the footer link and prelaunch
`noindex, follow`. Its canonical is `https://goalhint.com/en/privacy`.

## Publication gate

`src/domain/privacy-notice.ts` records `publication: prelaunch-summary`,
`releaseReady: false`, no effective date and an actual repository review date of
**10 October 2026**. The public page prominently explains that it is a factual
prelaunch summary, not a completed/effective privacy notice. Unresolved facts
are ordinary disclosures, not placeholder names, contacts or TODOs. No final
notice branch or environment switch can bypass the missing approvals.

**Public release is blocked** until the owner supplies and verifies the operator,
audience/jurisdiction, lawful public privacy contact, rights/request handling,
actual hosting/log/recipient/processing-location arrangements, analytics decision
and permission-compatible retention/deletion/backup rules. OP-26/27/28 are the
direct notice gates; OP-08/13/31/32 own related retention/source/deployment facts.
Jurisdiction-specific legal basis, rights, complaints, transfers, children's
audience requirements and any consent obligations must be reviewed against those
facts. The user's timezone and specification's author attribution establish
neither the operator nor the applicable law.

The user explicitly chose to keep operator/jurisdiction/contact unresolved and
record release blockers, and to keep the current implementation while recording
unresolved hosting/log, analytics and retention decisions. This does not approve
those operating facts. There is no invented controller, postal address, email, regulator,
response deadline, retention duration or claim of compliance/exemption. Final
notice publication and production release need a new factual/legal review and
an explicit recorded decision. Existing runtime operation approval does not
complete this gate. Prompts 040–041 remain outside this implementation.

## Actual inventory reviewed

| Flow / purpose | Data and recipient | Actual storage / retention / evidence |
| --- | --- | --- |
| Public access | Page/API requests work without visitor accounts, authentication tokens, registration, payments or subscriptions. | `domain/public-policy.ts`, Prisma schema and public HTTP handlers contain no visitor account/session system. No privacy/contact form was added. |
| Request delivery and infrastructure protection | A web/network host necessarily handles connection metadata, request address/query, time and browser headers. Its logging or additional protection cannot be inferred from repository code. | No hosting provider, region, access-log configuration, retention contract or deployed security/monitoring service is approved. No blanket claim of zero logs, zero personal data or a fixed log-deletion period is supportable. OP-26/27/30/32 remain open. |
| Application diagnostics | Public handlers return static classified failures; private workers emit allowlisted job/attempt/reason events. | `matches/public-http.ts`, `jobs/job-worker.ts`, `cost-control/cost-observability.ts` and worker entry points do not establish a visitor event-log database or a hosting-log retention policy. Framework/development/build telemetry is distinct from visitor analytics; this task does not change tool telemetry. |
| Private operational monitoring (044) | An authenticated, approved operator binding can inspect aggregate stored run/job/lock/result/quota/cost state and bounded canonical correlations; alert payloads carry coded incident owner/destination and runbook references. No visitor identifiers, request URLs, raw evidence, headers, credentials or exception text are collected. | Owner explicitly chose **local verification only**. No live binding, destination, scheduler or hosted recipient is enabled. `OperationsMonitorState` is one bounded outbox (64 slots/128 KiB), not an event log. Approved future retention must be explicit, at most seven days, and prunes on authorized transactions; stopped monitoring/backups do not imply physical deletion. Canonical records retain their existing unresolved retention policy. The local test sink is bounded process memory with TTL. See `operations-monitoring.md`; OP-26/30/31/32 remain open. |
| Optional aggregate server measurements (044) | Server-only HTTP latency/cache counters and fixed histograms contain only five route families and fixed outcome codes. They contain no search strings, fixture IDs, IPs, cookies or visitor/session identifiers. | Hooks are wired but **disabled by default**; an approved private bootstrap/retention reference is required to install a process-local collector. At most 25 series and an explicitly configured window of at most one day, expiring on access/cleared on close. No external upload or web endpoint. Hosting/fleet collection and recipients remain pending. This is not browser analytics, mobile field CWV or evidence of anonymous hosting logs. |
| Field performance/search/usage measurement (044) | A private pure function can summarize approved bounded mobile aggregate samples while preserving lab/field and environment labels. Search impressions/indexed pages/CTR sources are pending; returning visits and match-detail visitor use remain disabled. | Synthetic acceptance samples establish only function behavior; no production traffic or field percentile is claimed. No browser beacon, SDK, cookie, consent assumption, source property, retention promise or new recipient is introduced. Actual field/search-source authorization, sampling/qualification and analytics/privacy choices precede activation. |
| Search and filters | Search text, dates, league/status/market/sort, page position and performance model/version filters travel in same-origin page/API URLs. The browser, serving infrastructure and anyone receiving a copied URL can see them. | `domain/feed-query.ts`, `feed-pagination.ts`, `performance-query.ts` and browser refresh serialization. URLs can remain in history/bookmarks. Do not claim that account-free searches are anonymous or never retained. |
| Aggregate search protection | Database scope `matches`, window start and request count; not an IP-, cookie- or visitor-keyed limiter. | `matches/search-limit.ts`, `PublicSearchLimit`: one shared row, reset on the next eligible search after the window. No search string or visitor identifier in this counter; resetting a window is not deleting server logs. Existing bounds are 120 searches/minute. |
| Shared response cache | Request/filter-derived hash keys, shared football DTO bodies, source generations, created/expiry times. Bodies can include original search text in next/previous pagination URLs. | `cache/public-cache.ts`, `mysql-public-cache.ts`, `matches/feed-service.ts`. Five-second mutable reuse and at most six-hour immutable reuse, capped by earlier invalidation/source permissions. Expiry prevents reuse; a separate bounded maintenance pass deletes expired bodies. Durable invalidation/audit records and backups have no approved deletion schedule. A hash is not an anonymity guarantee. |
| Local layout preference | `goal-hint:preferences:v1`: format version and comfortable/compact density; local to the browser origin. The current feed has no exposed density switch; provider code reads a valid stored value and writes only when density changes. | `state/provider.tsx`, `state/preferences.ts`. No application expiry, account linkage or preference upload. It may remain until overwritten, cleared or removed by the browser. No automatic write on ordinary feed hydration or the privacy page. |
| Back restoration | `goal-hint.feed-navigation.v1` in session storage: entry ID, query key/href (including searches), first/last page, scroll, focus fixture, version marker and save time. Random `goalHintFeed` history marker identifies a local entry. | `components/match/feed-restoration.ts`, `domain/feed-navigation.ts`. At most 20 entries; records older than 30 minutes are ignored and pruned on later saves, not necessarily physically removed at expiry. Browser page-session retention/restoration also applies. Markers/checkpoints are not uploaded; restored match pages are requested normally. No fixture/prediction/result payload persists here. |
| Page memory and live refresh | Provider-local Redux/request state and currently loaded stored match projections. Browser GET updates omit credentials; hidden views pause background refresh. | `state/store.ts`, `refresh-api.ts`, `use-live-refresh.ts`, `use-feed-pagination.ts`. No visitor profile or fixture persistence in browser storage. Blocking storage preserves ordinary navigation; privacy content has no polling/store provider. |
| Visitor cookies, analytics and advertising | No application-set visitor cookies, analytics SDK, ad tags, tracking pixels, consent platform or session replay exists. | Searched `src`, package dependencies, `next.config.ts` and proxy; inspected public handlers. Advertising remains fixed disabled in `publicPolicy`. No future analytics decision or consent exemption is inferred; OP-26 remains unresolved. Future hosting must be audited separately. |
| Third-party images | Approved, structurally safe HTTPS team-logo URLs become native browser `img` requests to their actual media host. That host receives IP/request/browser information and can have its own cookies/logs under browser rules. | `components/match/team-row.tsx` uses `referrerPolicy=no-referrer`; that suppresses the page address, not the connecting IP. `football/catalog-mysql-store.ts` verifies logo authority before persisting URLs. No application optimization proxy, binary storage or image cache. Competition logo URLs can be stored, but current cards/details do not render competition/editorial images. Browser HTTP caching is separate. |
| First-party assets and source links | Bundled Goal Hint brand files and local Manrope font use site requests. Clicking news/provider links visits an external service with its own processing rules. | `app/layout.tsx`, brand components, `match-detail-content.tsx`. Per-match source links suppress referrers; do not claim that every external service's cookies/log retention is controlled by Goal Hint. No third-party asset is embedded by the privacy page. |
| Football, reporting, evidence and predictions | Structured API-Football data, attributable reporting and immutable football/evaluation/audit records are distinct from visitor profiles; sources can mention identifiable players/people. | Catalog retention authority and evidence `reuse.retainUntil` gate permitted ingestion/reuse/display. Public reads cannot dispatch provider/research/model work or send visitor search text to those services. OP-08/13/31 still require actual permission-compatible retention/deletion/backup evidence. A permission deadline does not prove physical deletion of all copies. |
| Privacy rights/contact | No owner-approved public privacy recipient or request-handling policy is supplied. | OP-27/28 block final notice/release. No fake email, link to a working intake, request form, mailbox, message or unsupported turnaround promise is added. Existing interim Contact page remains owned by 041. |
| Backup and recovery tooling (045) | Private encrypted snapshots/logs can contain the database's structured football/source/history, operational records and shared caches (including request-derived pagination/search text). No visitor profile or new analytics collection is added. | Owner explicitly chose **local verification only**. The executed drill uses synthetic data and ephemeral in-memory keys, restores only to process-owned disposable instances and cleans its owned artifacts. No persistent application backup schedule, hosted storage recipient, deletion period or source-retention entitlement is enabled. Future backup/key access, source permissions, physical deletion/suppression after restore and hosted retention must be approved under OP-08/13/26/30/31/32. Private health events are allowlisted and backup metrics stay pending without fresh approved evidence. See `backup-restore.md`. |

The application has not been redesigned to resolve these operating decisions.
No new analytics, tracking, consent UI, account or retention infrastructure is
enabled. The notice interpolates the existing navigation/cache bounds rather
than introducing a second set of operating limits.

## External references and limits

Reviewed on 10 October 2026:

- [MDN localStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage)
  describes origin-scoped persistence without automatic expiry.
- [MDN sessionStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage)
  describes tab/page-session scope and restoration; the app's age rejection is
  distinct from the browser's removal of stored bytes.
- [MDN Referrer-Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Referrer-Policy)
  supports the limited effect of `no-referrer`.
- [EDPB transparency and individuals' rights guidance](https://www.edpb.europa.eu/sme/be-compliant/respect-individuals-rights_en)
  is a **conditional review reference**, not a determination that EU GDPR applies.
  It informs the completeness checklist for controller identity, processing,
  recipients, retention and a usable rights route. No jurisdiction-specific
  deadline, legal basis, regulator, applicability or compliance assertion is
  copied into the public summary. Actual audience/operator facts are still needed.

## Verification

Run the actual production build/server, then
`npm run test:privacy:html -- http://127.0.0.1:PORT`. The check verifies initial
content/CSS, canonical/noindex, unique section anchors, publication gate/review
date, no cookies/form/placeholder contact, exact retention distinctions and
untrusted query isolation. Existing navigation HTML checks cover footer/current
page and fallback routes. Browser acceptance uses the Playwright skill/CLI and
keeps screenshots/source under `output/playwright/039-*`.
