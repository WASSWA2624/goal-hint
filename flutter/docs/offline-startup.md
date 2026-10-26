# Persistent offline startup

The shared implementation is in Next.js. Read the
[web cache contract](../../next-js/docs/offline-startup.md) for exact schema,
entry, versioning, storage and privacy rules. Flutter opens its configured origin
in the existing persistent WebView profile. It adds no native content cache,
asset server, authentication implementation or background queue.

After successful connected preparation, a service worker can reopen a complete
**Saved matches** web interface across process termination, using real web code
and permitted content. This does not save subscriber Best Slips: root and `/en`
fall back to clearly labelled Saved matches. `/en/matches` without query is the
supported cached feed; uncached routes explain the connection requirement and
offer saved matches or retry.

The anonymous snapshot contains at most 30 basic fixtures, at most 128 KiB,
with a maximum 24-hour display lifetime and visible saved timestamp. Predictions,
prices, remote imagery, identities/entitlements, account/payment information and
credentials are absent. Existing private/no-store HTML, RSC and APIs are not
saved. Cookies remain separate and server authorization remains authoritative.
The cache cannot restore another account's data or grant subscriber access.
No writes are queued or replayed.

Web readers tolerate at most five minutes of device/source clock difference for
the capture timestamp. Server-side freshness checks, expiry and the 24-hour
envelope bound remain intact. A real Android read exposed a roughly one-second
device lag; final Android cold-start qualification remains open and must not be
inferred from browser or Windows results.

## Origins and preparation

The installed engine must expose service workers in a secure context and retain
its profile. Production uses the configured HTTPS origin. Recognized loopback
can host a production-like development build; ordinary LAN HTTP works online but
cannot prepare this cache. `next dev` skips preparation because its assets
change outside a coherent build.

Build the website with `npm run build`, then use `npm start` with an appropriate
port/address. The build also generates the hash-pinned anonymous entry/asset
manifest. Select that origin through central Flutter configuration. See
[development URLs](development-urls.md) for emulator addressing and paired
wireless ADB. A physical Android test can use an owned wireless reverse mapping
to a production-like loopback server; remove that test mapping afterwards while
preserving pairing. LAN and loopback origins have separate stores. Never copy
cookies or cache files between origins to manufacture a passing test.

Visible startup, foreground and connection hints share one web refresh
controller. Actual validated same-origin manifest/snapshot reads establish
reachability; `navigator.onLine` is only a hint and cannot prevent a successful
probe. Failures retry after 5, 15, 30 and 60 seconds, then five minutes; a healthy
copy is checked after five minutes. Repeated hints preserve backoff and do not
create concurrent refresh loops. Successful recent checks suppress hints for
60 seconds; explicit checks obey the two-second minimum and server Retry-After.
Hidden documents, page exit and disposal cancel owned work. The saved view's
**Check for updates** action requests a check without reloading its document.

Every required resource is staged and verified before activation; failure keeps
the previous valid cache. A complete newer cache becomes available for future
reads without replacing the active document or its draft, history, focus and
scroll. New service workers follow the browser's normal waiting lifecycle,
without forced activation over existing clients. At most two 10 MiB content
bundles plus small metadata/browser overhead are retained. Cleanup affects only
recognized owned cache names. Cookies/unrelated storage are retained and no
work continues after the app is terminated.

Windows forwards Flutter hidden/resumed lifecycle through the selected plugin's
existing WebView2 pause/resume APIs so the shared document receives real
visibility events. Calls are ordered, hidden/paused coalesce, and hidden startup
is remembered until the controller exists. Suspension is best effort; the host
does not add a native poller or content cache. [Microsoft's WebView2 lifecycle
reference](https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/icorewebview2_3?view=webview2-1.0.4022.49)
describes visibility, suspension and automatic resume behavior.

## Failure and acceptance boundary

With no usable entry—first-ever offline launch, denied/evicted storage, missing
assets, corruption or expiry—the native connection error and Retry remain the
recovery path. If the entry loads without usable content, the web interface
explains that state. It does not claim saved rendering without a validated bundle.
Expired snapshots are not served; expired owned bundles are removed when read,
with other old-bundle cleanup during preparation. Browser/OS eviction remains possible.

Qualify each real installed engine: prepare online, terminate, block the test
origin, and reopen without clearing app data. Check a saved and an uncached route,
missing/corrupt/first-use storage, logout/account switching and the absence of
private content in CacheStorage. Restore connectivity and retain the original
profile. A browser-only success is insufficient.

Actual results belong in [the tracker](../dev-tracker.md), with shared evidence
linked from [web 069](../../next-js/dev-plan/069-offline-shell-support.md).
Windows passed final current-source installed cold/recovery checks. Android's
first-use Retry and worker registration were verified, but a prepared bundle
and final offline cold restart remain unverified after the owner's stop.
Apple execution requires
its native host; Linux still has no qualified engine. No unavailable target is
qualified by these sources or a package platform list. Reconnection/failed-update
platform acceptance continues in
[005](../dev-plan/005-reconnection-and-cache-updates.md).
