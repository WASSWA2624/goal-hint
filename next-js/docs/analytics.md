# First-party analytics

Goal Hint counts visits with its own consent-gated tracker and stores them in the
application database. The operator reads them in a password-protected dashboard at
**`/analytics`**. There is no third-party analytics service, advertising tag or
tracking cookie.

| Part | Where |
| --- | --- |
| Browser tracker and consent banner | `src/components/analytics/tracker.ts`, `analytics-tracker.tsx` (mounted in `src/app/layout.tsx`) |
| Shared contract, metric rules, goals | `src/domain/analytics*.ts` |
| Collector, reports, sign-in, retention | `src/server/analytics/` |
| Dashboard and sign-in page | `src/app/analytics/page.tsx`, `src/components/analytics/dashboard/` |
| APIs | `src/app/api/analytics/{collect,login,logout,report,live,export,settings}` |
| Schema | migration `20261014131920_first_party_analytics` (7 `Analytics*` tables) |
| Tests | `npm run test:analytics` (unit + isolated MySQL acceptance) |

## Privacy design

- **Consent first.** Nothing is stored in the browser or sent before the visitor
  chooses *Allow analytics*. *Decline* is as prominent as *Allow*. The banner only
  appears when the server is actually collecting. `AnalyticsProvider` resolves
  that boolean from the same services as `GET /api/analytics/collect` and passes
  it with the page; displaying the banner needs no extra status request.
  Browser consent, privacy signals and automation exclusions still resolve
  before the banner appears, and only explicit consent starts collection.
  The consent text is server-rendered. A small inline check reads the existing
  choice and browser signals before paint, so first-time visitors can read it
  while the application hydrates; its buttons enable once handlers are ready.
  The check makes no storage writes or requests. Returning choices and privacy
  signals suppress the prompt before paint. Shared pure consent rules keep this
  check and the hydrated tracker consistent, including blocked/expired storage.
  Browser settings are separate from server validation schemas to avoid loading
  those schemas just to display the consent choice.
  Visitors can change or withdraw the choice on the Privacy page; withdrawing deletes
  the browser's identifiers at once. The choice is asked again after 12 months.
- **Browser signals.** Global Privacy Control and Do Not Track count as *declined*,
  in the script and again on the server (`Sec-GPC`, `DNT`).
- **Exclusions.** Bots, crawlers, link previews, scripts and headless or automated
  browsers (`navigator.webdriver`) are dropped. Signing in to the dashboard sets an
  HttpOnly exclusion cookie for 400 days, so the operator's browser stays out of the
  statistics after signing out; the dashboard itself is never tracked.
- **Minimisation.** Stored: an HMAC of a random browser ID (not the ID), page path
  without query string or fragment, page title, engaged time, link/button labels,
  search terms, referrer domain, UTM tags, browser/OS family and major version,
  device type, screen-width band, language and an approximate country/city. Never
  stored: IP addresses, the raw user agent, typed form input, click identifiers
  (`gclid`, `fbclid`… are reduced to their ad network). Search terms and labels are
  lower-cased/trimmed and anything resembling an email address or phone number is
  redacted. Outbound and download links lose their query strings.
- **Location** comes from the browser's IANA time zone (`Africa/Kampala` → Uganda,
  Kampala) through a table generated from the public-domain tz database
  (`scripts/generate-analytics-timezones.py`). No IP lookup is made. Behind Cloudflare
  or Vercel, `GOAL_HINT_ANALYTICS_GEO_SOURCE` can read their visitor-location headers.
- **Campaigns** survive the SEO clean-URL redirect (`src/server/seo/proxy.ts`) in the
  redirect's fragment, `#gh_attr=…`, which browsers never send to a server. The tracker
  reads it once and removes it from the address bar.

## Metric definitions

All dates are East Africa Time. A **visit** (session) ends after 30 minutes without
activity in any tab; opening a campaign-tagged link starts a new one.

| Metric | Definition |
| --- | --- |
| Unique visitors | Distinct browsers with a visit starting in the period. |
| Visits (total visitors) | Visits starting in the period. |
| Page views | Pages shown in the period, including in-app navigation. A same-page reload within 10 s (the app's metadata recovery) continues the same page view. |
| Pages per visit | Page views of the period's visits ÷ visits. |
| Avg. visit duration | First page view to last recorded activity (heartbeats included), or engaged time if longer. |
| Time on page | Engaged time: the tab is visible and there was pointer, key, scroll or touch input in the last 5 minutes. Visible pages report every 30 s and on hide/unload. |
| Bounce rate | Visits that were **not engaged**: one page view, under 10 s engaged and no conversion. |
| New visitors | Browsers whose first-ever visit is in the period. |
| Returning visitors | Browsers with a visit in the period after an earlier one. A browser can be both. |
| Visit frequency | Visits per visitor within the period, and each visit's lifetime visit number. |
| Live visitors | Distinct visitors with activity in the last 5 minutes. |
| Conversions | Goals, once per visit: *Opened a match analysis*, *Built a slip* (`slip_build` event), *Followed a source link* (any outbound link), *Searched matches*. Conversion rate = converted visits ÷ visits. Goals live in `analyticsGoals`. |
| Channel | UTM medium first (cpc/paid → paid search or paid social, email, social, organic, referral), then click IDs, then the referrer: search engine, social network, AI assistant, webmail or other referral; none → Direct. |
| Navigation paths | Page-to-page transitions and each visit's first four content groups. |

Comparisons use the preceding period of equal length or the same dates a year earlier.
Charts bucket by hour (≤ 2 days), day (≤ 120 days) or ISO week.

Track another product action from a client component with
`trackEvent("snake_case_name")` from `@/components/analytics/tracker`; add a goal in
`src/domain/analytics.ts` to count it as a conversion.

## Dashboard

Summary cards with period deltas, a traffic chart (visitors, visits, page views,
duration, bounce rate, conversions) with comparison line and table view, new vs
returning, devices, channels, frequency, a weekday × hour heatmap, live pages and
sortable tables for pages, content groups, entry/exit pages, transitions, journeys,
channels, referrers, campaigns, countries, cities, devices, browsers, OS, languages,
screen widths, clicks, outbound links, searches, downloads and conversions. Selecting
a row (or *Add a segment*) filters everything; the state lives in the URL. Every table,
the series and the summary export as CSV (UTF-8 with BOM; spreadsheet formulas are
neutralised; percentages as 0–100, durations in seconds).

## Access control

- `/analytics`, `/admin` and their reporting/mutation APIs require the current
  authenticated account to be an unblocked administrator. There are no credentials
  in client code and no separate dashboard login form.
- Everyone signs in at `/en/account?view=login` through `/api/account/login`.
  Administrator roles come from current server configuration after the password is
  verified. Administrators go to `/admin`; ordinary users go to `/en`.
- Account passwords, throttling, verification, HttpOnly cookies and one-device
  sessions follow [member authentication](member-authentication.md). Removing an
  administrator number or rotating its environment credential withdraws its access.
- Legacy dashboard login endpoints redirect with HTTP 303 to the shared form without
  accepting credentials. Legacy owner cookies cannot authorize dashboards. Sign-out
  revokes the account session and clears both current and legacy cookies.
- State-changing requests require same-origin Fetch Metadata or `Origin`. Dashboard
  responses are `no-store`, `noindex`, un-frameable; `robots.txt` disallows `/analytics`
  and `/admin`.

## Setup

1. **Schema.** On MySQL, `npm run db:deploy` applies the migrations. On production
   MariaDB, inspect pending migrations and use reviewed MariaDB SQL where needed;
   earlier MySQL-only `DROP CHECK` statements cannot be replayed directly. The
   `prisma/mariadb/20261014131920_first_party_analytics.sql` overlay creates the seven
   analytics tables and records the original migration, but `IF NOT EXISTS` does
   not validate existing tables or their engines. Also apply corrective migration
   `20261014161000_transactional_storage` and verify every `Analytics*` table uses
   **InnoDB**: this host's MyISAM default does not support the collector and login
   transactions. Preserve already applied migration SQL and checksums. See the
   [MariaDB deployment procedure](../deploy/how-to-deploy.md#database-updates-on-mariadb)
   for backup, incremental validation and recovery. The application role needs
   `SELECT, INSERT, UPDATE, DELETE` on the seven `Analytics*` tables (the local
   `application-grants.sql` has section F; a cPanel database-level grant covers them).
2. **Settings** (all in `.env.example`):

   | Setting | Development | Production |
   | --- | --- | --- |
   | `GOAL_HINT_ANALYTICS_ENABLED` | `true` (default) | `true` |
   | `GOAL_HINT_ANALYTICS_SECRET` | fixed development value | **required**, 32+ random characters |
   | `GOAL_HINT_ADMIN_PHONES` | configured canonical phone array | **required for dashboard access** |
   | `GOAL_HINT_ADMIN_PASSWORD_HASH` | configured scrypt hash | **required**, or private `GOAL_HINT_ADMIN_PASSWORD` fallback |
   | `GOAL_HINT_ANALYTICS_RETENTION_DAYS` | 395 | optional; the dashboard can override |
   | `GOAL_HINT_ANALYTICS_GEO_SOURCE` | `timezone` | `timezone`, `cloudflare` or `vercel` |

   Administrator numbers use the same login as ordinary accounts. Legacy username
   credentials, including `admin` / `admin`, cannot sign in. Production collects
   nothing without the secret. Create the administrator hash with
   `npm run analytics:hash-password` (input
   is hidden; at least 12 characters) and paste the printed line into
   `deploy/.env.production.local`, then `python scripts/deploy-cpanel.py --config-push`.
   Generate the secret with e.g. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
   Changing the secret starts new visitor keys (existing visitors count as new).
3. **Retention.** Raw rows older than the retention period (default 395 days, choices
   30–730 in the dashboard, any 1–1095 by setting) are purged hourly when visits arrive
   or the dashboard is used, by *Purge expired data now*, or by `npm run analytics:purge`
   (suitable for cron). Shortening retention deletes older data immediately.

## Verification

- `npm run test:analytics` — 18 unit tests (payload validation, bot/UA/channel/geo
  classification, redaction, periods and buckets, CSV, scrypt, production credential
  refusal, collector exclusions and rate limits, 401s on every reporting API, cookie
  flags) and an isolated MySQL 8.4 acceptance test that records synthetic visits and
  asserts every summary metric, series bucket, heatmap cell, breakdown, segment filter,
  comparison, live count, sign-in lockout, session expiry and retention purge exactly.
- Browser check (14 Oct 2026, dev server): consent banner → page views, engaged time,
  clicks, search and conversions stored; dashboard sign-in error and success; all
  panels 343 px wide at a 375 px viewport with no horizontal scroll.
- MariaDB (local XAMPP 10.4.32, throwaway database): the production apply script ran twice
  (idempotent, one `_prisma_migrations` row) and collection, hourly/daily/weekly reports,
  live counts, sign-in lockout and purge all worked. Production runs MariaDB 11.4.


## Paid access (066)

Access goals: subscribe-view (pageview of `/[locale]/subscribe`), trial-requested (`trial_requested`), payment-submitted (`payment_submitted`), code-entered (`code_entered`). All custom names must match `^[a-z][a-z0-9_]{0,47}$`. Payloads accept the name and pageview reference only, never values. Successful JS actions emit through the existing consent-gated tracker; no-JS code entries are not counted. Forms exclude click capture; labels group Account/Get access without phone/code/query values. Long-digit redaction remains unchanged.
