# Connection recovery

Goal Hint gives slow live document requests time to respond. If a request fails or the server does not send headers within 15 seconds, the service worker can display the prepared connection page at the original URL. **Try again** starts a new browser request for that URL, including its filters. A direct visit to `/offline` sends the retry to Matches after hydration. The connection page renders a heading and a retry action in the active light or dark theme.

An open Matches page keeps the rows currently displayed if a filter change stalls. At 15 seconds the busy controls become available and a retry link retains the requested filters. That timeout is separate from the document request deadline. Background refreshes stay quiet.

## Preparation and storage

`npm run build` runs the Next.js build and writes `public/offline-manifest.json` from the static `/offline` entry and its client reference manifest. The manifest lists the exact byte counts and SHA-256 digests of the entry and its required first-party assets. Deploy the generated manifest together with those files.

The root-scope `/offline-worker.js?connection-page=1` worker fetches assets without credentials. It validates public response headers, limits, schema and digests before switching the active cache. An interrupted or rejected bundle leaves the verified previous bundle available. A matching asset can be reused after integrity verification. Preparation starts after page load and idle time, runs only for a visible document, and never replaces the active document. Failure retries back off at 5, 15, 30 and 60 seconds, then five minutes. A successful check waits five minutes. Server `Retry-After` values are bounded.

The worker prepares the static entry and assets only. Live documents, fixture data, account/session data, private APIs and personalized RSC responses are excluded. A write always goes through the normal request flow. No write can be queued or replayed by this worker. A live document that has sent headers can continue streaming. Authorization responses remain authoritative.

| Resource | Limit |
| --- | --- |
| Bundle | Up to 10 MiB for a complete entry and assets. Up to two recognized bundles are retained. |
| Entry or asset | Up to 4 MiB individually. |
| Required assets | Up to 256, with bounded concurrent downloads. |
| Preparation network | 8 seconds per fetch and body read. 45 seconds for the full preparation. |
| Document navigation | 15 seconds to receive headers. A network failure can fall back sooner. |

`PREPARE` and `STATUS` expose the verified `connection-page` version, with preparation outcomes when relevant. The worker shares concurrent attempts, takes a nonqueued Web Lock where available and releases work when its last owner cancels. It uses the browser’s normal update lifecycle. A previous worker can keep serving its earlier fallback until its clients close. When the replacement activates, it removes the recognized V1 Saved Matches caches. Cookies and unrelated storage are separate. The old anonymous snapshot endpoint remains available to previously deployed clients during the transition.

## Cold launch and local verification

Cold launch requires a verified bundle in the retained browser profile. On first use without connectivity, or after storage is denied, evicted or corrupted, the browser or native host supplies its normal connection error. A successful online launch can prepare the page again. [Flutter connection recovery](../../flutter/docs/offline-startup.md).

Use HTTPS or a recognized loopback origin. Production-like local builds can run with `npm run build` and `npm start`. `next dev` skips new registrations and serves the retirement worker for existing Goal Hint registrations. It unregisters itself, removes only recognized Goal Hint cache names, and reloads controlled development tabs once. [Registration requirements](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerContainer/register).

The synthetic offline fixture and fault proxy cover slow headers, rejected assets, a fully offline navigation, retries and private-data isolation. Use the same origin and profile between online and offline checks. Installed Flutter hosts need separate qualification. [Owned acceptance fixture](../tests/helpers/rendering/offline/README.md).
