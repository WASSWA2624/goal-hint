# Native web integration acceptance

`shell_integration_test.dart` runs the production shell and native browser
adapters against an isolated Next.js fixture. Run commands from `flutter/`.
The existing web dependencies must be installed in `next-js/` first.

Start the fixture in a separate terminal:

```sh
python tool/serve_web_fixture.py --host 0.0.0.0 --port 3187
```

The server copies the existing Next.js member rendering fixture into the ignored
`next-js/.tmp/` directory and adds the test support routes from this folder.
It uses the application's real account HTTP adapters with scripted services:
no real database, message provider, payment, or private environment file is used.
The default bind address is loopback; `0.0.0.0` also allows a phone on the private
development LAN. Choose a different free port if necessary. Ctrl+C stops the
owned server. `--reuse <path>` can reuse the built fixture reported by this tool.

For Windows, run the two phases as separate commands:

```sh
flutter test integration_test/shell_integration_test.dart -d windows --no-uninstall --dart-define=APP_ENV=development --dart-define=DEV_APP_ORIGIN=http://127.0.0.1:3187
flutter test integration_test/shell_integration_test.dart -d windows --no-uninstall --dart-define=APP_ENV=development --dart-define=DEV_APP_ORIGIN=http://127.0.0.1:3187 --dart-define=SHELL_CHECK_PHASE=reopen
```

For a physical Android phone, use its device ID and the development computer's
reachable LAN address in both commands. For the standard Android emulator, use
`http://10.0.2.2:3187`. Keep the same origin for both phases. See
[development URLs](../docs/development-urls.md) for routing and
[the README](../README.md) for this Windows host's process-local JDK/temp setup.

Flutter's integration-test command defaults to uninstalling the previous app.
**Both phases require `--no-uninstall`** so the second process can inspect the
same native browser profile. The first phase leaves one synthetic HttpOnly
member cookie; the second checks server-recognized membership and signs out.
Do not clear cookies, application data, or the WebView profile between phases.

The first phase awaits the adapter's suspend checkpoint before the test host
stops the process. Android uses that checkpoint to commit its normal WebView
cookie store; no token is copied into preferences and server cookie flags are
unchanged. This models normal background/close behavior rather than promising
survival of an unfinished write during an immediate kill or power loss.

For a paired wireless phone, follow [wireless development](../docs/development-urls.md#android-wireless-development)
and select its exact device ID. When the isolated fixture's LAN port is blocked,
an owned `adb -s <wireless-device-id> reverse tcp:3187 tcp:3187` mapping allows
`DEV_APP_ORIGIN=http://127.0.0.1:3187`. Remove that mapping with
`adb -s <wireless-device-id> reverse --remove tcp:3187` when finished. The normal
Next.js app on LAN port 3000 does not require this test mapping.

The fixture check covers internal links and query parameters, browser history,
Android framework back handling, unfinished form input across resume, a blocked
unsafe web navigation, external-link handoff, login and registration web forms,
synthetic code entry, reload/session persistence, server role checks, expiry,
logout, and account-change HTTP transport. The Windows check also verifies the
absence of the plugin's JavaScript bridge and rejection of an unsafe native
navigation request. External destinations are captured by the injected host
callback; this automated test opens no external application.

The account-change services are scripted. Their checks qualify native/web HTTP
transport and cookies, not real password changes, phone verification, message
delivery, or a production account backend. The real session resolver rejects an
expired synthetic server record even while its cookie is retained. No native
credential store or authorization bypass is introduced by the fixture.

A separate read-only phase targets the complete running Next.js development app:

```sh
flutter test integration_test/shell_integration_test.dart -d windows --no-uninstall --dart-define=APP_ENV=development --dart-define=DEV_APP_ORIGIN=http://127.0.0.1:3000 --dart-define=SHELL_CHECK_PHASE=live
```

This phase checks rendered content, horizontal overflow at normal and doubled
document text size, the real account input, and back navigation. It never
submits an account form or makes account/payment mutations. The text check
changes only the document's root font size; it is not a system accessibility
setting test. Actual keyboard interaction, native window resizing, system
external-app launch, and unavailable platform execution need separate recorded
checks. These tests make no offline-startup claim.

## Durable offline startup

`offline_startup_test.dart` uses the actual shared web worker, offline UI and
assets from an isolated production-like Next.js build. Its anonymous snapshot
and root marker are synthetic. It performs no account/payment writes or private
database reads. From the repository root, build the owned fixture first:

```sh
python next-js/scripts/serve-offline-fixture.py --build-only
```

The helper reports an ignored `next-js/.tmp/offline-*` directory. Keep its
server stopped for the first-ever offline phase, before that origin has acquired
a cache. From `flutter/`:

```sh
flutter test integration_test/offline_startup_test.dart -d windows --no-uninstall --dart-define=APP_ENV=development --dart-define=DEV_APP_ORIGIN=http://127.0.0.1:3189 --dart-define=OFFLINE_CHECK_PHASE=first
```

From the repository root, start the fixture in a separate terminal, substituting
its reported directory:

```sh
python next-js/scripts/serve-offline-fixture.py --reuse <fixture-directory> --port 3189
```

Run the same Flutter command with `OFFLINE_CHECK_PHASE=online`. It requires a
secure context, an active controlling worker, the committed web-cache marker,
and an actual dated anonymous offline document. Then stop the owned server with
Ctrl+C and run `OFFLINE_CHECK_PHASE=offline` as a separate app process at the
same origin. This verifies durable rendering while no app-server request can
succeed; Wi-Fi itself stays available for wireless device control.

With that server still stopped, run `OFFLINE_CHECK_PHASE=uncached` to verify an
unknown route shows recovery feedback. `OFFLINE_CHECK_PHASE=corrupt` invalidates
only the worker-created integrity record in retained app bundles and requires
recovery instead of a saved view. To test eviction afterward, restart the server
and run `online` again, then stop the server and run
`OFFLINE_CHECK_PHASE=evicted`. That phase deletes only this origin's
`goal-hint-offline-*` caches and verifies a missing copy produces honest recovery
feedback. It retains cookies, other storage, unrelated caches and the browser
profile. A first-ever repeat needs a previously unused fixture origin; retaining
a registered worker is not the same condition.

For physical Android, pair wireless ADB as described in
[development URLs](../docs/development-urls.md#android-wireless-development),
create an owned `adb -s <wireless-device-id> reverse tcp:3189 tcp:3189` mapping,
and replace `windows` with the exact wireless device ID. Keep the phone unlocked
and awake while the native test runs. Keep the loopback
`DEV_APP_ORIGIN`: ordinary LAN HTTP and the Android emulator host alias are not
service-worker secure origins. Trusted development HTTPS is an alternative.
No certificate bypass or insecure-origin flag belongs in this acceptance path.
Remove only the owned mapping when finished and restore the normal app entry
point/development origin after test installation.

The harness inspects real CacheStorage response policies/URLs and verifies no
offline POST/password form. Shared web tests separately qualify schema,
corruption, staging/update recovery and private-data exclusions. Runtime
results and unavailable platforms remain recorded in
[the tracker](../dev-tracker.md); this harness does not infer Apple/Linux support.

With the owned fixture online, `OFFLINE_CHECK_PHASE=diagnostic` reports only
worker registration state and the public preparation version/error reply. It
does not print cached content, cookies or credentials. This distinguishes an
engine/origin registration failure from a rejected cache contract on a device.

## Reachability and safe updates

`reconnection_test.dart` is Windows-only acceptance using the real built worker,
offline UI and persistent WebView2 profile. Android execution remains excluded
at the owner's request. Build/start the fixture backend above on port 3189, then
start the owned fault proxy from `next-js/`:

```sh
python scripts/serve-offline-proxy.py --backend http://127.0.0.1:3189 --port 3192 --fixture-dir <fixture-directory> --control .tmp/offline005-windows-control.json --stats .tmp/offline005-windows-stats.json
```

The helper initializes its ignored JSON control/stats files. Generation A uses
the real fixture's bundle. B is a coherent derived acceptance generation with a
new required asset and public data version, not a second release build. Fault
controls and counters are file-only, without a network administration endpoint.
They contain no cookies, private content or request bodies. Keep this proxy
isolated from the normal development server and unrelated browser proxy.

From `flutter/`, substitute absolute paths for the two ignored files:

```sh
flutter test integration_test/reconnection_test.dart -d windows --no-pub --no-uninstall --dart-define=APP_ENV=development --dart-define=DEV_APP_ORIGIN=http://127.0.0.1:3192 --dart-define=RECONNECT_CHECK_PHASE=seed --dart-define=OFFLINE_CONTROL_FILE=<absolute-control-file> --dart-define=OFFLINE_STATS_FILE=<absolute-stats-file>
```

Run `seed`, then `failures` as separate app processes at the same origin/profile.
The latter exercises genuine automatic retry, repeated hints, 503/captive/401,
missing/held/truncated required assets and an eight-second timeout. Exact A cache
identity must remain usable. It records a synthetic unsent DOM draft and checks
document identity, history, focus, selection and scroll. This is controller-driven
DOM input, not a native-keyboard acceptance claim. A single synthetic failed POST
has no real account/database behind it and must never be queued or replayed.
Browser disposal must abort the held request before its natural timeout and
prevent later refreshes. The final strict elapsed-time assertions were added
after the observed run; the independently retained proxy record measured 209 ms.
Worker/browser tests separately exercise cancellation semantics.

Stop only proxy 3192, leaving the backend and browser profile intact. Run
`RECONNECT_CHECK_PHASE=recover`. It must first cold-start exact A without its
server. At the `minimize-restore` checkpoint, minimize the owned app window using
the actual OS UI, hold at least 12 seconds, then restore it within the five-minute
operator bound. Synthetic Flutter lifecycle events do not satisfy this phase:
both actual native hidden/resumed and browser hidden/visible events are required.
Leave the proxy stopped until the next `restore-server` checkpoint. Then restart
the same proxy command; the harness already selected healthy B. It allows six
minutes for genuine automatic backoff recovery, retains the unsent draft, and
requires complete B while `navigator.onLine` remains false. This hint is changed
only in the owned test WebView through CDP `Network.overrideNetworkState`; real
server outage/HTTP faults establish reachability independently. No host network,
radio, certificate or security setting is changed.

After `recovery-complete` and process termination, stop proxy 3192 and run
`RECONNECT_CHECK_PHASE=final-cold`. A new process must render saved B with the
server absent and without replaying the failed synthetic POST. Remove only owned
fixture processes after all acceptance clients finish. Restore the normal
`lib/main.dart` Windows Debug binary/development origin; logs, proxy controls,
profiles and binaries stay ignored. See [the tracker](../dev-tracker.md) for
actual execution, setup failures, source checks and unqualified targets.

## Installed identity and appearance

`identity_test.dart` checks the real Windows host, shared website theme controls
and persistent browser profile. Android execution is deferred by the owner;
other native engines are not inferred qualified from this Windows check.
The fixture imports the actual root layout/providers, `BrandLogo` and
`ThemeToggle`, without accounts, private services or a database. From `flutter/`:

```sh
python tool/serve_identity_fixture.py --port 3193
```

The helper reports an owned ignored `next-js/.tmp/identity-*` directory and a
loopback server. It supports `--build-only`, `--reuse <directory>` and
`--reuse <directory> --rebuild`. Create an owned UTF-8 JSON file beneath that
directory, for example `identity-control.json`:

```json
{"phase":"first","advance":""}
```

Run the native check with its absolute control-file path:

```sh
flutter test integration_test/identity_test.dart -d windows --no-pub --no-uninstall --dart-define=APP_ENV=development --dart-define=DEV_APP_ORIGIN=http://127.0.0.1:3193 --dart-define=IDENTITY_CONTROL_FILE=<absolute-control-file>
```

The phase and operator acknowledgements are read at runtime, so both processes
use the identical Dart defines. A sibling `*-checkpoint.json` reports the current
stage, owned PID and public theme snapshot. Set `advance` to that stage after
inspection; `all` skips operator holds. Each hold is bounded to five minutes and
the whole interactive check to 25 minutes. These are test-controlled durations,
not cold-start performance measurements.

1. `startup` holds the real shell's white logo/name/spinner before native browser
   initialization. Capture it under the current OS appearance, then acknowledge.
2. `system` has no explicit fixture theme preference. Record the original OS
   appearance, change it through actual Windows Settings, return the app to the
   foreground, and wait for web/native colors before capture. Acknowledge this
   stage; the harness rechecks current CSS, metadata, every native color and the
   absent storage key before any explicit toggle. `*-system.json` retains both
   public snapshots.
3. `light` and `dark` follow the website's actual theme button. Inspect native
   decorations and web content, then acknowledge each stage. The harness verifies
   the stored preference and a true document reload using `performance.timeOrigin`.

Wait for the first command and all its owned host/browser processes to exit;
the `complete` checkpoint alone is written just before widget disposal and is
not process-termination evidence. Keep the server, exact origin and profile.
Change the control to `{"phase":"reopen","advance":""}` and rerun the same
command with `--no-uninstall`. The second process has another white `startup`
checkpoint, then a `reopen` checkpoint requiring the saved dark preference and
matching web/native appearance. It subsequently removes only this fixture
origin's theme key and verifies the system fallback after reload.

Use actual OS Settings for OS-appearance evidence; engine media emulation cannot
qualify native window chrome. Restore the operator's original OS appearance,
stop only owned fixture/test processes, and rebuild the normal `lib/main.dart`
Debug entry point/development origin. Keep screenshots, JSON controls, profiles
and binaries ignored. The check inspects a running window; it makes no installed
or pinned shortcut/taskbar/dock/signing claim. Actual results and remaining
platform gaps are recorded in [the tracker](../dev-tracker.md).
