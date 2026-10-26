# Embedded web application

The shell renders the existing Next.js application from the origin selected by
[the shared configuration](development-urls.md). Dart owns native browser
creation, loading/error feedback, back navigation, and external-link handoff.
Routes, queries, forms, accounts, authorization, payments, and content/theme
remain in Next.js. See [the tracker](../dev-tracker.md) for actual platform checks.

## Browser adapters

| Target | Adapter | Browser storage |
| --- | --- | --- |
| Android | Official `webview_flutter` 4.14.1 / Android 4.14.1 | Normal Android WebView cookie store and DOM storage |
| iOS/macOS | Official `webview_flutter` 4.14.1 / WKWebView 3.26.2 | Default persistent WKWebsiteDataStore; no ephemeral configuration |
| Windows | Locally patched `flutter_inappwebview_windows` 0.6.0, using WebView2 | App support directory, `webview2/<environment>`; never the executable directory |
| Linux | No qualified embedded adapter yet | No browser/offline capability claimed |

The WKWebView version is pinned to the installed Dart 3.12.2-compatible release.
Do not substitute the latest package without checking its SDK minimum.
The lockfile records all platform implementations. The Windows package is used
directly, avoiding an additional mobile WebView implementation.

Windows requires Microsoft Edge WebView2 Runtime. If it is absent, the shell
shows a useful error; installation/provisioning belongs to release packaging.
Native compilation also needs NuGet on the build process's PATH. SDKs, NuGet
executables, native binaries, local profiles, and logs stay out of Git.

The Windows stable plugin's upstream URL callback intercepts network document
requests but cannot alone guard every navigation scheme. Its local native patch
checks parsed scheme/host/port before document navigation, handles popup requests
without orphaned native deferrals, and disables the unused JavaScript bridge.
The vendored package retains its license and an upstream/change record. Review
those changes when updating the dependency; replacing it with an unpatched pub
release removes the native guard.

## Navigation and appearance

Only the exact configured origin is trusted for embedded application documents.
Routes, query strings, and fragments remain with the website. A different host,
scheme, or port is outside that trust boundary. HTTP(S), `mailto`, and `tel`
external links use the operating system's handler; malformed/credential-bearing
addresses and other schemes are rejected by the shell's navigation policy.
The native website has no Dart JavaScript channel or broadly privileged bridge.

The official system adapter's owned-document click listener converts anchor
`target="_blank"` to the current frame before the native policy runs. This also
covers links added during Next.js navigation without duplicating routing or
exposing native methods to JavaScript. It does not override `window.open` or
promise support for arbitrary popup-driven authentication. Known child-frame
callbacks never launch an external application. Android's native plugin bypasses
some child-frame callbacks; subresource/frame isolation and content policy still
belong to the browser and website, not an invented native request firewall.

Native Android back uses browser history first, then permits the platform to
leave the shell. WKWebView enables its normal history gestures. Desktop views
resize with the window; Alt+Left and F5 are also shell shortcuts when Flutter
owns keyboard focus. Native browser focus/accelerators may handle their own
keys. Safe areas and keyboard insets avoid adding a second header, navigation
tree, or product theme. On Android, the web layer owns the bottom safe area:
`SafeArea(bottom: false)` prevents reserving the native bottom inset twice when
Android WebView also exposes it through CSS `env(safe-area-inset-bottom)`.
The web tab bar retains its normal safe-area padding, including on iOS; the
Android correction does not remove shared web behavior.

Resuming the app refreshes history capability without reloading the document,
discarding form input, or clearing storage. Closing a browser does not clear its
normal profile. Server cookie flags and session validity remain authoritative;
a persistent cookie never overrides expiry, revocation, roles, or logout.

Android explicitly commits the ordinary WebView cookie store after a completed
page and on pause/background. A no-argument Flutter-to-native method invokes
`CookieManager.flush()` on a background executor, with an `onStop` fallback.
It passes no cookies, tokens or credentials across the channel and exposes no
JavaScript bridge. The native test awaits this same suspend checkpoint before
its host stops the process, modeling normal background/close behavior. Server
cookie flags and lifetime are unchanged; this does not guarantee an unfinished
write survives an abrupt kill or power loss before a checkpoint.

Android's official WebView requires an explicit HTML file-input callback. The
shell uses official `file_selector` 1.1.0 with the system document picker,
respecting single/multiple selection and accept filters. Cancellation resolves
to an empty selection. Selected paths become file URIs for the existing web
form; Next.js still validates and uploads the files. Capture hints fall back to
the system picker rather than opening a camera directly. No broad storage or
camera permission is added. Native picker interaction remains a separate manual
check; synthetic account tests do not select private files.

iOS declares a camera-purpose description for the website's photo attachment
input in both Debug and normal plists. This is source configuration only;
actual Apple picker/camera permission behavior remains untested here.

## Failures and TLS

Startup and main-document transport failures show a small native error and
Retry. Retry reuses the browser/profile and the last attempted trusted document.
External-handler failure leaves the current page/input in place and shows a
message. Subresource failures do not cover the whole application with an error.
Application 4xx pages remain web-owned. Identifiable main-document HTTP 5xx
responses can show Retry; the selected WK plugin omits the request/frame identity
in that callback, so WK renders those HTTP responses through the website.

Normal certificate validation stays enabled. The shell cancels certificate
errors and HTTP-auth challenges; it does not accept insecure certificates or
store account passwords. The previous Debug-only development HTTP policy still
applies. Android WebView inspection and Windows developer tools are Debug-only.

## Reproducible native acceptance

The [acceptance harness guide](../integration_test/README.md) records fixture
coverage, the separate live-app phase, and the limits of scripted services.

Use the isolated web fixture rather than real accounts. From the repository root:

```sh
python flutter/tool/serve_web_fixture.py --host 0.0.0.0 --port 3187
```

This builds the existing Next.js member rendering fixture plus local shell test
routes. It sends no verification messages, writes no real database, and uses
only synthetic identities. Bind the LAN interface only when testing a phone;
the default loopback binding is sufficient for desktop checks. Ctrl+C stops its
owned server. Do not deploy these test routes or point acceptance at real users.

From `flutter/`, use a reachable origin and the selected device:

```sh
flutter test integration_test/shell_integration_test.dart -d windows --no-uninstall --dart-define=APP_ENV=development --dart-define=DEV_APP_ORIGIN=http://127.0.0.1:3187
flutter test integration_test/shell_integration_test.dart -d windows --no-uninstall --dart-define=APP_ENV=development --dart-define=DEV_APP_ORIGIN=http://127.0.0.1:3187 --dart-define=SHELL_CHECK_PHASE=reopen
```

For a physical Android phone, replace `windows` with its device ID and loopback
with the development computer's LAN address. Use the same origin and preserved
installed app/profile for both phases. `--no-uninstall` matters: the selected
Flutter test command otherwise uninstalls the app and destroys persistence
evidence. A full second test process verifies the cookie through the server's
session endpoint, then signs out. Test-only controller calls inspect the DOM;
they create no production JavaScript bridge.

The fixture covers web forms, navigation/history/query preservation, external
handoff callbacks, session/reload/reopen/logout behavior, role authorization, and
an expired server record. Scripted account-change services verify transport and
cookie behavior; they do not qualify real message delivery or production account
changes. Additional manual keyboard/accessibility and Apple/Linux checks remain
platform acceptance work where those hosts/devices are unavailable.

Persistent browser storage alone is groundwork for [004](../dev-plan/004-persistent-offline-startup.md).
The [shared Next.js implementation](../../next-js/docs/offline-startup.md) now
adds the explicitly permitted anonymous entry/assets/data cache. See
[offline setup and qualification](offline-startup.md); ordinary cookies and
private pages are separate from that store.

Primary references: [official WebView package](https://pub.dev/packages/webview_flutter/versions/4.14.1),
[WKWebView adapter](https://pub.dev/packages/webview_flutter_wkwebview/versions/3.26.2),
[upstream Windows release](https://pub.dev/packages/flutter_inappwebview_windows/versions/0.6.0),
[WebView2 user data](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/user-data-folder),
and [external URL launching](https://pub.dev/packages/url_launcher/versions/6.3.3).
The [official file selector](https://pub.dev/packages/file_selector/versions/1.1.0)
and its [Android implementation](https://pub.dev/packages/file_selector_android/versions/0.5.2+11)
provide the native file-input picker.
