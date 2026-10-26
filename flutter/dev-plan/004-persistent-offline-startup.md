# 004 - Persistent offline startup

**State: Partial — shared cache and Windows cold-start/recovery verified; final Android cold-start verification was stopped at the owner's request. Apple/Linux qualification remains open.** Prerequisites: [003](003-web-app-integration.md), verified platform persistence support from [001](001-foundation-and-platform-support.md), and the agreed shared cache contract in [web 069](../../next-js/dev-plan/069-offline-shell-support.md). Follow [the specification](../../app-write-up.md) and [the shell requirements](../../prompts/flutter-app-shell.md).

## Outcome

After a successful online visit, an installed app can cold-start without internet and display the last working cached web app with permitted previously loaded content. A screenshot or an in-memory WebView is insufficient.

## Work

- Audit existing Next.js responses, dynamic routing, authentication, and cache headers before defining the offline boundary. Coordinate the shared implementation through [web 069](../../next-js/dev-plan/069-offline-shell-support.md); add only necessary native persistence or local asset-delivery support for verified platform gaps.
- Define the required entry document, compatible assets, route dependencies, and permitted data for a coherent offline startup. Persist the last usable version across process termination, rather than relying on an open tab. Document which cached routes work and how uncached navigation behaves.
- Respect existing private/no-store response policies and server authorization. Cache public or explicitly permitted content only; do not broaden private caching to make an offline demonstration pass. Never cache passwords, verification codes, payment evidence, or session credentials in the offline content store.
- Keep offline reads separate from server-dependent actions. Clearly identify unavailable operations; do not queue payments, authentication, account changes, or other writes as an incidental feature of caching.
- Provide a useful first-launch offline state and recovery action when no usable cache exists. Handle cache eviction/corruption without claiming successful startup, and scope cache cleanup to data owned by this app.
- Define user-specific cache isolation and logout cleanup for any explicitly permitted personal content. A different user must never see another user's offline data; if safe private offline access cannot be established, keep that content unavailable offline.

## Acceptance and handoff

- Successfully load online, terminate the process, disable networking, and reopen the installed app. Verify real cached rendering and content on each supported target, including a cached route and an uncached route.
- Check first-launch offline, missing/corrupt cache, logout then offline restart, and switching accounts where applicable. Verify private response policies remain intact.
- Record shared-web files, cache contents, retention/cleanup behavior, tests, and unsupported capabilities in [the tracker](../dev-tracker.md). Link actual shared-web results from [web 069](../../next-js/dev-plan/069-offline-shell-support.md), then hand off the cache contract to [005](005-reconnection-and-cache-updates.md).

## Implementation handoff

The [shared cache contract](../../next-js/docs/offline-startup.md) defines a
viewer-independent `/offline` entry, pinned compatible assets, and an explicit
anonymous public match projection. Normal HTML/RSC, private APIs, predictions,
credentials and remote imagery never enter this store. The existing native
profiles supply durable CacheStorage; no native content database or JavaScript
bridge was added. See [native setup and limits](../docs/offline-startup.md) and
[the tracker](../dev-tracker.md) for actual browser/device checks.

Production HTTPS or a production-like localhost build is required. Normal
`next dev`/LAN HTTP remains online development; it does not prepare an offline
bundle. Apple service-worker qualification and Linux embedding remain open.

The native [acceptance harness](../integration_test/README.md#durable-offline-startup)
uses the existing persistent browser profiles and separate application processes.
Windows demonstrated saved rendering with its fixture server stopped, plus
uncached-route, corrupted-cache and eviction recovery. Wi-Fi remained available;
this was an app-origin outage, not an airplane-mode test. Android demonstrated
first-use offline Retry and service-worker registration, then rejected a snapshot
because strict server/device timestamp comparison exposed a small clock skew.
The shared web validator/view now allow a bounded five-minute comparison
tolerance without changing device clocks, server expiry or authorization rules.
The owner declined further Android checks, so the final fix and Android offline
cold restart remain unverified. Browser/Windows results do not close that gap.

No Flutter production adapter, native content database or new permission was
needed. Remaining native reconnect/update, foreground and release qualification
continues in [005](005-reconnection-and-cache-updates.md) and
[007](007-platform-builds-and-release.md).
