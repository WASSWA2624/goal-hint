# Privacy page and data-flow review

Prompt 039 implements `/en/privacy` in the existing information/public shell.
The English page is server rendered, has section anchors, readable shared
typography and square components, and retains the footer link and prelaunch
`noindex, follow`. Its canonical is `https://goalhint.com/en/privacy`.

## Publication gate and confirmed owner facts

On **12 October 2026**, the owner supplied Wilson Wasswa, Uganda, as the operator,
a worldwide English-speaking audience aged 18+, and the same person as the
privacy/correction/dispute owner. The exact approved public email is
`wasswawilon0002@gmail.com`. `src/domain/public-operator.ts` holds the shared facts;
the Contact page publishes the email without a form or sending backend.

The owner confirmed a Namecheap-hosted database, no launch visitor analytics,
advertising or affiliate promotions, and public API-Football data/logo permission.
That is an owner confirmation, not an independent contract verification. Existing
browser storage, third-party logo requests and source retention constraints remain.

Launch and the intended notice effective date are **1 November 2026**. They are
planned dates: `privacyNotice.plannedEffectiveOn` records the plan and `effectiveOn`
remains null. The server country and actual log/backup retention periods are
explicitly unknown. A daily frequency does not establish a deletion period.
`releaseReady` therefore remains false until the hosting, log, source-retention
and deletion/backup disclosures can be completed from actual operating facts.
The page no longer presents operator identity, contact, audience, analytics choice
or a planned date as missing. No public indexing or deployment approval is implied.

Earlier 10 October decisions deferred these owner facts; the 12 October answers
supersede those deferrals for the facts listed above. Jurisdiction-specific privacy
requirements must be assessed using the actual Ugandan operator, global audience
and completed processing inventory, without inventing legal bases or exemptions.

## Actual inventory reviewed

| Flow / purpose | Data and recipient | Actual storage / retention / evidence |
| --- | --- | --- |
| Public access | Page/API requests work without visitor accounts, authentication tokens, registration, payments or subscriptions. | `domain/public-policy.ts`, Prisma schema and public HTTP handlers contain no visitor account/session system. No privacy/contact form was added. |
| Request delivery and infrastructure protection | A web/network host necessarily handles connection metadata, request address/query, time and browser headers. Its logging or additional protection cannot be inferred from repository code. | The owner identifies Namecheap database hosting; server country, access-log configuration, retention and any deployed security/monitoring service remain unknown. No blanket claim of zero logs, zero personal data or a fixed log-deletion period is supportable. OP-26/27/30/32 remain open. |
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
| Visitor cookies, analytics and advertising | No application-set visitor cookies, analytics SDK, ad tags, tracking pixels, consent platform or session replay exists. | Searched `src`, package dependencies, `next.config.ts` and proxy; inspected public handlers. Advertising remains fixed disabled in `publicPolicy`. The owner explicitly keeps analytics, ads and affiliate promotions disabled at launch; no consent exemption is inferred. Future hosting must be audited separately. |
| Third-party images | Approved API-Sports team and league PNGs are resized and cached by Goal Hint. The provider receives the server request when the cache fetches or refreshes an original. Other approved remote hosts receive direct browser requests and associated IP/request/browser information under browser rules. | `components/ui/provider-image.ts` and `app/badges/[kind]/[id]/[size]/route.ts` restrict optimization to known provider paths and five sizes, with no redirects and seven-day cache revalidation. `team-logo.tsx` uses `referrerPolicy=no-referrer` for browser requests; this suppresses the page address, not the connecting IP. Catalog approval still controls permitted URLs. Cache refresh is on demand; cached files in retained releases persist until deployment cleanup. Browser HTTP caching is separate. |
| First-party assets and source links | Bundled Goal Hint brand files and local Manrope font use site requests. Clicking news/provider links visits an external service with its own processing rules. | `app/layout.tsx`, brand components, `match-detail-content.tsx`. Per-match source links suppress referrers; do not claim that every external service's cookies/log retention is controlled by Goal Hint. No third-party asset is embedded by the privacy page. |
| Football, reporting, evidence and predictions | Structured API-Football data, attributable reporting and immutable football/evaluation/audit records are distinct from visitor profiles; sources can mention identifiable players/people. | Catalog retention authority and evidence `reuse.retainUntil` gate permitted ingestion/reuse/display. Public reads cannot dispatch provider/research/model work or send visitor search text to those services. OP-08/13/31 still require actual permission-compatible retention/deletion/backup evidence. A permission deadline does not prove physical deletion of all copies. |
| Privacy rights/contact | Wilson Wasswa handles requests at the owner-approved public email on Contact. | A fixed mailto opens the visitor's email client. No form, sending backend, delivery test or unsupported response deadline is added. The hosting/retention facts still prevent final notice publication. |
| Backup and recovery tooling (045) | Private encrypted snapshots/logs can contain the database's structured football/source/history, operational records and shared caches (including request-derived pagination/search text). No visitor profile or new analytics collection is added. | Owner explicitly chose **local verification only**. The executed drill uses synthetic data and ephemeral in-memory keys, restores only to process-owned disposable instances and cleans its owned artifacts. No persistent application backup schedule, hosted storage recipient, deletion period or source-retention entitlement is enabled. Future backup/key access, source permissions, physical deletion/suppression after restore and hosted retention must be approved under OP-08/13/26/30/31/32. Private health events are allowlisted and backup metrics stay pending without fresh approved evidence. See `backup-restore.md`. |

The application has not been redesigned to resolve these operating decisions.
No new analytics, tracking, consent UI, account or retention infrastructure is
enabled. The notice interpolates the existing navigation/cache bounds rather
than introducing a second set of operating limits.

## External references and limits

### Namecheap account verification (12 October 2026)

The hosting plan, server country and account retention settings have **not** been
verified. Public documentation describes plan capabilities, not Goal Hint's
configuration. The available browser reached Namecheap's sign-in screen; a narrow
search of connected Gmail found no matching Namecheap hosting records. No hosting
setting, mailbox content, public notice or indexing flag was changed by this review.

Use the following read-only checks after signing into the hosting account:

| Check | Where to look | Evidence to record |
| --- | --- | --- |
| Hosting identity and location | Namecheap > Hosting List > relevant subscription > Manage > Server Hostname; alternatively cPanel > General Information > Server Information > Server Name | Product/plan, current server hostname and explicitly stated datacenter country. Confirm the app and database both use that location; domain registration or a DNS/CDN IP alone is insufficient. |
| Website access logs | cPanel > Metrics > Raw Access > Configure Logs and Archived Raw Logs | Archive and automatic removal settings, domains covered, oldest archive date and rotation schedule. A monthly cleanup setting is not proof that every copy is deleted after exactly 30 days. |
| Statistics and other logs | cPanel Metrics, application runtime/process-manager settings and Namecheap support | Whether AWStats or other hosting reports are retained, plus error, security and application-log retention. Check any CDN separately. |
| Backups | cPanel > Exclusive for Namecheap Customers > AutoBackup, if included in the plan | Available daily/weekly/monthly versions, oldest snapshot, covered databases/files, backup storage countries and maximum retention. View the list without restoring or generating a download. |
| Provider-controlled copies | Namecheap support | Retention/deletion of host security logs, maintenance backups, backup replicas and copies outside the account controls; behavior after file deletion/account termination. |

Namecheap documents the [Hosting List hostname field](https://www.namecheap.com/support/knowledgebase/article.aspx/10730/22/faqs-on-migration-from-timico-to-datum-datacenter-on-shared-hosting/)
and [cPanel/welcome-email alternatives](https://www.namecheap.com/support/knowledgebase/article.aspx/1425/27/what-server-is-my-account-hosted-on/).
An old welcome email can predate a migration; prefer current account information.
The [datacenter guide](https://www.namecheap.com/support/knowledgebase/article.aspx/136/22/where-are-your-datacenters-located-how-can-i-request-to-change-the-datacenter/)
lists possible locations but does not identify this subscription's country. Ask
support to confirm the country against its current hostname and any backup replicas.

Namecheap's [access-log guide](https://www.namecheap.com/support/knowledgebase/article.aspx/9563/29/how-can-i-check-my-website-access-logs/)
documents cPanel's archiving/removal controls. Its [visitor information article](https://www.namecheap.com/support/knowledgebase/article.aspx/10501/12/does-namecheap-collect-visitor-information-on-my-hosted-website/)
states that Shared Hosting stores access logs containing IPs, request details,
timestamps, referrers and browser information and processes them into cPanel
statistics. Per-user log collection cannot be disabled on Shared Hosting. This
must be distinguished from Goal Hint's disabled browser analytics; do not describe
the hosting environment as collecting no visitor information.

The [AutoBackup guide](https://www.namecheap.com/support/knowledgebase/article.aspx/10103/2210/how-to-use-autobackup-cpanel-plugin/)
describes Stellar Plus/Business with six daily, three weekly and five monthly
versions, and a list covering six months. The [product FAQ](https://www.namecheap.com/hosting/autobackup/)
instead mentions recovery as far back as a year. Neither establishes this
account's maximum physical deletion period. Ask support to reconcile the scope
for the actual plan. The separate 15-day availability of generated downloads is
not snapshot retention. Namecheap's [server-backup article](https://www.namecheap.com/support/knowledgebase/article.aspx/156/22/do-you-have-server-backups/)
describes maintenance backup frequency without establishing a maximum deletion
period for this account. Account-created/manual backup copies need their own
deletion schedule.

Suggested message for the owner to send through Namecheap's authenticated support
channel (prepared only; not sent):

> For the hosting subscription serving goalhint.com, please confirm the plan and
> server hostname, the countries where the website/database and backup copies are
> stored, and retention for access/error/security logs, AWStats records and any
> enabled CDN logs. Which periods can I configure, and which are controlled by
> Namecheap? Please confirm the backup schedule, maximum snapshot/replica retention,
> deletion of expired copies and how deleted data ages out of backups. The AutoBackup
> guide describes six months of listed backups while the product FAQ mentions a
> year; which applies to my plan? Please distinguish frequency from retention.

Record support's answer and review date privately; store only non-secret relevant
facts/evidence references here. Do not commit credentials, raw visitor logs,
download links, full support transcripts or database backups.

### Adopted email retention policy (effective 1 November 2026)

On **12 October 2026**, Wilson Wasswa explicitly adopted the following policy
starting **1 November 2026** for Goal Hint correspondence at
`wasswawilon0002@gmail.com`. It is an adopted operating policy with a future
effective date, not a claim that Gmail deletion settings or automation have been
configured. The full privacy notice's separate publication gate remains in place.

| Category | Adopted rule |
| --- | --- |
| Routine support and correction correspondence | Keep up to six months after resolution. |
| Privacy requests | Keep only a minimal request, response and outcome record for up to twelve months after closure; remove unnecessary attachments sooner. |
| Identity verification material, only if necessary | Delete promptly when no longer needed. Do not routinely request identity documents. |
| Unresolved cases or documented disputes/legal holds | Keep only relevant material while necessary. Record the reason and review every ninety days; delete when the exception ends if the normal deadline has passed. |

These operating periods should be reviewed against actual needs. Section 18 of
Uganda's [Data Protection and Privacy Act, Cap. 97](https://nita.go.ug/sites/default/files/2026-09/Data%20Protection%20and%20Privacy%20Act%20cap%2097.pdf)
uses necessity-based retention with specified exceptions; it does not prescribe
the six- and twelve-month periods above.

Separate Goal Hint correspondence from personal mail with labels and record the
case closure/deletion due date. Review monthly for upcoming deadlines and delete
by the due date, including sent replies, archived messages, attachments and any
exported copies under the operator's control. A received-message date is not the
case closure date, so a broad age-based Gmail search alone cannot enforce this rule.

[Gmail retains deleted messages in Trash for up to thirty days](https://support.google.com/mail/answer/7401?co=GENIE.Platform%3DDesktop&hl=en-GB).
To meet the adopted maximum mailbox deadlines, the operator must permanently
delete only the due Goal Hint messages by the deadline, including their Trash
copies. The operator will handle this process; no messages were deleted or
automation enabled by this task. It does not promise immediate deletion from
Google's internal systems.

Public wording records the adoption and future effective date:

> From 1 November 2026, we will keep routine support and correction correspondence for up to six months after
> resolution, and a minimal record of privacy requests for up to twelve months after
> closure. We delete unnecessary identity-verification material promptly. We may
> keep relevant information longer where necessary to resolve an ongoing dispute
> or meet a legal obligation, with exceptions reviewed every ninety days. These periods apply to copies under our control;
> Google processes email through Gmail under its own policies.

Hosting verification, implementation of the adopted correspondence handling and
the existing source-data retention/deletion evidence must inform the final notice. Policy adoption alone does not
mark privacy or terms release-ready or satisfy the application's indexing gate.

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
