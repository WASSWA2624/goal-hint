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
