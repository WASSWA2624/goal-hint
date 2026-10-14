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
  appears when the server is actually collecting (`GET /api/analytics/collect`).
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

- `/analytics` and every reporting API check a server-side session; there are no
  credentials in client code. Sign-in is a plain form POST to `/api/analytics/login`.
- Passwords are stored only as `scrypt:N:r:p:salt:hash` (N=2^15, r=8, p=1).
- Sessions: 32 random bytes in an HttpOnly, `SameSite=Strict` cookie (`__Host-` and
  `Secure` in production); only a SHA-256 of the token is stored. They end after 2 idle
  hours or 12 hours in total, or on sign-out.
- Five failures within 15 minutes lock the username **and** the client address for
  15 minutes (keys are HMACs; no address is stored). Every attempt runs scrypt, so an
  unknown username takes as long as a wrong password.
- State-changing requests require same-origin Fetch Metadata or `Origin`. Dashboard
  responses are `no-store`, `noindex`, un-frameable; `robots.txt` disallows `/analytics`.

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
   | `GOAL_HINT_ANALYTICS_ADMIN_USERNAME` | `admin` | **required** |
   | `GOAL_HINT_ANALYTICS_ADMIN_PASSWORD_HASH` | hash of `admin` | **required**; a hash of `admin` is refused |
   | `GOAL_HINT_ANALYTICS_RETENTION_DAYS` | 395 | optional; the dashboard can override |
   | `GOAL_HINT_ANALYTICS_GEO_SOURCE` | `timezone` | `timezone`, `cloudflare` or `vercel` |

   **`admin` / `admin` works in development only.** Production disables sign-in until
   a secret, username and non-default password hash are set, and collects nothing
   without the secret. Create the hash with `npm run analytics:hash-password` (input
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
