# Anonymous offline startup

The website owns offline rendering, content eligibility and durable storage. The
Flutter shell retains its normal browser profile and opens its configured origin;
it adds no native content cache or replica interface. Actual execution results
belong in the [web tracker](../dev-tracker.md) and
[Flutter tracker](../../flutter/dev-tracker.md).

## Saved interface and permitted data

`/offline` is a statically built **Saved matches** interface. It reuses the normal
styling provider, brand, layout, match-card list and match cards. Offline cards
omit links/actions requiring a server. The entry and its parent layout read no
account/session data. Request-time analytics, metadata recovery and member
notices live in `OnlineRuntime` in the normal locale/owner layouts, outside this
entry.

After complete preparation, a failed document request can display this entry at
the original URL. Root and `/en` normally lead to Best Slips; their offline
fallback is explicitly **Saved matches**, not a saved subscriber slip.
`/en/matches` without query parameters is the supported saved feed. Root, `/en`,
`/offline` and supported trailing-slash variants can show the same snapshot.
Filters, dated archives, details and other uncached routes show an unavailable
state with a saved-matches link and retry.

| Property | Contract |
| --- | --- |
| Source | `GET /api/offline/snapshot`, fixed English default feed, page 1, at most 30 records. Cookies and request parameters never choose the viewer or query. |
| Gate | Existing gated reader with a fixed free, signed-out resolver, then an explicit field allowlist. |
| Envelope | Strict schema version 1, captured/expiry timestamps, EAT reporting date and unique fixture records. |
| Records | Fixture ID/version; team IDs/names/codes; competition ID/name/country; kickoff/sync timestamps; status, score and score period. |
| Lifetime | At most 24 hours of display from the source read. The saved timestamp and stale-content notice stay visible. Scores are never presented as current. |
| Bound | At most 128 KiB of validated JSON. Invalid, unavailable, future, expired or oversized reads return non-cacheable 503. |

Device readers allow a bounded five-minute difference when comparing the source
capture timestamp with the device clock. The server still rejects future source
reads, expired content is unavailable, and the 24-hour envelope lifetime is
unchanged. This accommodates small device clock differences without making
credentials or authorization available offline.

No forecasts, selections, probabilities, prices, revision/run/cycle metadata,
access/entitlement flags, account identities, credentials, search text or remote
image URLs enter this schema. Even completed predictions that are public online
are omitted. Cards use name/initial fallbacks instead of storing provider media.
This does not broaden source/media rights.

Normal HTML, personalized hydration/RSC, existing private/no-store match APIs,
account, payment, owner and analytics responses never enter this content store.
Existing cookies stay in the separate ordinary browser cookie store. Passwords,
verification codes and payment evidence are excluded. Authentication, payments
and other writes have no queue, replay or offline success path.

The cache is viewer-independent. Logout/account switching cannot expose another
person's saved content because personal data is never stored. It grants no
entitlement and cannot revive an expired session. Online server authorization
and private response headers remain unchanged.

## Coherent bundles and updates

`npm run build` runs `next build` then `scripts/build-offline-manifest.mjs`.
The post-build step reads the actual static entry and client-reference manifest,
follows required first-party JS/CSS/font dependencies, and includes only two
approved brand SVGs. Generated `public/offline-manifest.json` pins each URL,
byte count and SHA-256 digest, plus a digest of the coherent manifest. It is
ignored build output and must be generated/deployed together with that entry
and its assets.

`public/offline-worker.js` owns root-scope CacheStorage under the
`goal-hint-offline-` prefix. Only successful explicitly public responses with
the expected entry/manifest/snapshot markers qualify. Downloads omit credentials,
reject redirects, enforce bounded reads and verify exact bytes/hashes. Arbitrary
navigation responses and unrelated resources are never saved. Matching entry and
asset bytes can be copied from a previously verified bundle and rechecked against
the new manifest, avoiding repeated downloads when only the public snapshot
changes. Changed or missing resources still require verified network downloads.

| Limit | Bound |
| --- | --- |
| One bundle | 10 MiB of entry/assets/snapshot content, reserving snapshot and integrity-metadata allowances in the manifest. |
| Individual entry/asset | 4 MiB. |
| Required assets | At most 256, with bounded download concurrency. |
| Retained bundles | Active plus at most one staging/previous bundle: 20 MiB content budget, plus small metadata/browser overhead. |
| Network deadlines | 8-second fetch and body-read deadlines, 45 seconds for complete preparation; 4 seconds for navigation before saved fallback. |

A candidate is staged separately and fully revalidated before the active pointer
changes. Interrupted downloads, missing assets, policy/schema/hash failures,
quota denial or failed activation preserve an already valid active bundle.
Older manifest times, snapshot times and overlapping fixture versions cannot
replace newer accepted content. Cleanup deletes only recognized worker-owned
bundle names, leaving cookies and unrelated origin storage intact.

`OfflineBootstrap` uses one visible-document coordinator. Successful checks use
a five-minute cadence; recent online/foreground hints coalesce for 60 seconds.
Failures retry after 5, 15, 30 and 60 seconds, then at five-minute intervals while
the document remains visible. Manual checks observe a two-second minimum gap
and bounded server `Retry-After` values. Hints never overlap a running attempt or
reset its failure backoff. There is no provider poller or terminated-app service.

The public manifest and anonymous snapshot are the bounded reachability probes.
An online flag alone proves nothing; a false offline flag does not prevent a
successful real read. Timeouts/refusal, server errors, captive or wrong responses,
unexpected authentication walls, and storage/integrity failures remain distinct
finite results. An authentication wall on this anonymous endpoint is not a
session-status probe and does not change account state.

| Worker message | Meaning |
| --- | --- |
| `PREPARE` | `refreshed: true` means a complete verified server read succeeded; `activated` says whether a new bundle committed. |
| Retained result | `ok: true, retained: true, refreshed: false, updateError` means the previous cache is usable but the refresh failed. Public version/capture/expiry/count metadata accompanies it. |
| `STATUS` | Validates stored availability without a network check. `/offline-cache/status` exposes the same public metadata; `/offline-cache/snapshot` exposes only the approved projection. |
| Same-port `CANCEL` | Releases only that caller's preparation lease. Another visible caller can continue the shared attempt; the last cancellation aborts downloads and streams, with cleanup anchored by the worker event. |

Hidden, closed and disposed owners stop their timers and release their leases;
late replies cannot update disposed UI. Legacy 004 workers remain compatible:
their version-only preparation replies are followed by `STATUS` to recover the
actual snapshot lifetime. Unknown lifetime or failed status verification cannot
be presented as a fresh saved view.

Same-worker callers share one preparation promise. Writers also take the
nonqueued exclusive Web Lock `goal-hint-offline-prepare-v1` across worker
contexts. A busy or unsupported lock preserves a valid previous cache and
reports the limitation instead of starting a competing writer. Worker-code
updates use normal activation after existing clients close; there is no
`skipWaiting()` controller swap beneath an active form. A compatible new
entry/assets/data bundle can still be accepted without reloading that document.
See [the Web Locks coordination model](https://www.w3.org/TR/web-locks/).

Preparation does not reload the active page or replace its form, navigation,
focus or scroll. Its in-memory UI state contains public cache/update metadata,
not account state or persisted drafts. The saved view's **Check for updates**
action requests a read; **Try online again** explicitly reloads. A later cold
start uses the accepted complete version. Native qualification belongs in
[Flutter 005](../../flutter/dev-plan/005-reconnection-and-cache-updates.md).

## Missing storage and development

Without a usable complete cache, no offline success is claimed. A loaded entry
can explain missing/expired content; an engine unable to load any saved entry
reaches the shell's normal connection error and Retry. First-ever offline launch
cannot manufacture assets. Denial, eviction, corruption and expiry are recoverable
through a later successful connected preparation. Expired snapshots are not
served; expired owned bundles are removed when read, orphaned/old bundle cleanup runs during preparation, and the browser/OS
may evict storage independently.
[Storage lifetime and eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).

Service-worker registration needs a secure context and an available API. Use
production HTTPS or a production-like build on recognized localhost/loopback.
LAN HTTP still renders online but cannot prepare this cache. `next dev` skips
registration because its changing assets are not a coherent post-build bundle.
[Registration requirements](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerContainer/register).

From `next-js/`, a normal production-like workflow is:

```sh
npm run build
npm start -- --hostname 127.0.0.1 --port 3001
```

The server must supply its normal authorized public data; test fixtures remain
separate and synthetic. A physical Android development phone needs trusted HTTPS
or an owned wireless-ADB reverse mapping to a loopback production-like server.
Keep the same origin and installed profile across online/offline phases.
[Flutter development URLs](../../flutter/docs/development-urls.md) covers pairing
and transport. API availability is not installed cold-start evidence: Apple
execution and Linux embedding remain unqualified. See the
[platform matrix](../../flutter/docs/platform-support.md) and
[Flutter offline guide](../../flutter/docs/offline-startup.md).

The recorded 005 checks passed full-process offline cold A/B in Chrome
156.0.8078.48 and separate-process cold A/B in Windows WebView2 155. Windows also
passed actual OS minimize/restore, DOM visibility, active-draft preservation
through valid B recovery, and no write replay. The browser's valid-B transition
does not claim draft preservation; its failure/cancel phases do. The derived B
fixture adds a harmless required asset to one existing build, separate from
004's genuine Next.js rebuild check. Android testing is deferred and Apple/Linux
remain unqualified; [recorded progress](development-progress.md#005--reachability-and-safe-update-handoff)
keeps those scopes explicit.
