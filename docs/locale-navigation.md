# English routes and the public shell

Prompt [016](../dev-plan/016-locale-navigation.md) adds public navigation to the
[shared styling foundation](brand-styling.md). The shell reads no database or
provider and requires no visitor credentials, tokens or cookies.

## Routes and shared defaults

| Address | Contract |
| --- | --- |
| `/` | Permanent 308 redirect to `/en`, independent of browser language. |
| `/en` | The Today view of the shared feed; no decorative hero. |
| `/en/predictions/YYYY-MM-DD` | One EAT reporting day, including historical dates. |
| `/en/predictions/YYYY-MM-DD?status=finished` | The same feed restricted to finished fixtures. |
| `/en/how-it-works` | Interim methodology surface; replaced by 038. |
| `/en/privacy`, `/en/terms`, `/en/contact` | Interim information surfaces; replaced by 039–041. |
| `/en/matches/fixture-id/home-v-away` | Link convention reserved for 035. Unknown fixtures currently return 404; no invented match pages. |

`src/domain/navigation.ts` is the shared route contract. `feedDefaults`, owned
by `src/domain/feed-query.ts` and re-exported by navigation, defines
Today as day offset **0**, status **all**, and Results as day offset **−1**,
status **finished**. Both use `getFeedEntry` and `feedHref`; `/en/results` is
intentionally not an independent application or route. The finished filter is a
language-neutral group for regulation, extra-time and penalty finals; actual
query mapping belongs to 028/032. It does not imply a settled prediction.

`parseFeedView` reuses strict calendar date validation and rejects unsupported
or repeated status values. Prompt 017 extends both pages with the validated
[feed query and client-state contract](client-state.md), including relative
dates, bounded ranges, search, league, status, market, sorting and pagination.
Prompt 032 connects the feed to the shared cached stored-data service; controls
belong to 033. Unknown and incompatible query parameters return 404.
Invalid dates, unknown routes and unknown fixtures return 404 with navigation.
`matchHref` validates path segments but establishes no fixture existence or
canonical slug; 035 owns identity lookup and changed-slug redirects.

The request-scoped `getShellInstant` uses `connection()` and React `cache` to read
one current instant after a request arrives. `getShellDate` and feed reads use
that same instant. Shared calendar functions resolve
that instant to `Africa/Kampala`; a build cannot freeze the Today link. Every
new server request uses the current EAT day. Live rollover in an already open
tab belongs to 037. Links disable speculative prefetch while date-dependent
navigation is interim.

## Locale and message organization

`src/i18n/locales.ts` derives supported locales from `publicPolicy`: **en only**.
Unknown locale values fall back to English for message and link helpers. The
small Next.js proxy redirects locale-like prefixes such as `/fr`, `/sw` and
`/en-US` to `/en`, preserving the remaining path and query. It excludes API,
framework and asset paths. The locale layout rejects unsupported values that
reach rendering. There is no language selector or empty translated page.

The root document uses `lang="en"` from the same public policy, which is correct
for every published route and fallback. Before adding another complete locale,
move document-language selection into an appropriate locale root layout and
implement its metadata/canonical relationships under 042.

`src/i18n/messages/en.ts` owns stable, flat, namespaced interface keys.
`createMessages` exposes `text`, `plural`, `number` and `reportingDate`.
Translations can fall back per key; plural messages require `other`, select
forms through `Intl.PluralRules` and format counts through `Intl.NumberFormat`.
`feed.matchCount` is prepared but is not displayed without real feed data.
Date labels use `Intl.DateTimeFormat` with explicit EAT and Gregorian calendar,
reusing `getReportingDayBounds`. Domain market/status values and fixture/team
identities remain independent of display strings.

## Rendering and interim surfaces

`src/app/_components/public-shell.tsx` composes the server-rendered header,
home link, Today/Results links, single main landmark and information footer.
Pages supply the current location before hydration. `aria-current`, text
underlines and brand styling make it visible without relying on color alone.
The native fragment skip link moves keyboard focus to the main landmark.

Client styling stays in `src/components/navigation/shell-styles.tsx` and the
existing `ui/` primitives. One root style provider/registry, named first-party
logo, light tokens, square corners, wrapping and logical spacing are reused.
The earlier development primitive demo is no longer mounted on public pages;
the isolated `test:styling` fixture remains available.

All current locale pages inherit `noindex, follow`. The [032 feed](match-feed-page.md)
renders stored fixtures, predictions, coverage and run progress, with truthful
read-failure states. Methodology and information pages identify content being
prepared; replace them in 038–041. Prompt 042 owns final indexing policy.

## Verification

```text
npm run test:navigation
npm run build
npm run start -- --port 3106
```

With the production server running in another terminal:

```text
npm run test:navigation:html
```

The HTML check covers anonymous access, server-rendered styles and current
location, all shell links, noindex, root/fallback redirects and invalid-route
404s. Browser checks should use a fresh profile, a non-EAT timezone and a
non-English browser language. Exercise links and Back, Tab/Shift+Tab, skip-link
activation, JavaScript disabled, 320px width, doubled base text, 200% layout
zoom and expanded labels. Store visual evidence under ignored
`output/playwright/`.

Framework behavior was checked against installed Next.js 16.4 documentation
and the official [internationalization guide](https://nextjs.org/docs/app/guides/internationalization),
[proxy reference](https://nextjs.org/docs/app/api-reference/file-conventions/proxy)
and [redirect reference](https://nextjs.org/docs/app/api-reference/functions/redirect).
