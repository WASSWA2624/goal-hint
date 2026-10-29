# Flutter development tracker

**Current implementation: native web host, central URLs, and shared anonymous offline cache.**
The project includes five native runners, validated origin selection, native
network policy, shared loading/retry/history handling, and browser adapters for
Android, iOS, macOS, and Windows. Goal Hint names, shared launcher artwork, and
white launch/loading surfaces are implemented. Shared-web native appearance and
Windows theme/restart checks passed; overall appearance qualification remains
partial. Linux embedding remains unqualified. The shared web cache is implemented;
platform qualification and release acceptance remain tracked below. Reconnection
and safe updates now have shared-web and Windows acceptance evidence. Use
[the plan index](dev-plan/000-index.md) for dependencies and the handoff records
below for actual native execution evidence.

| Step | Feature | Status |
| --- | --- | --- |
| [001](dev-plan/001-foundation-and-platform-support.md) | Foundation and platform support | Completed — foundation and available Windows runtime verified |
| [002](dev-plan/002-environment-urls.md) | Development and production URLs | Completed — centrally configured installed loading verified on Windows and physical Android |
| [003](dev-plan/003-web-app-integration.md) | Embedded web app integration | Partial — available Windows/Android lifecycle and cold reopen passed; manual, Apple and Linux qualification remains |
| [004](dev-plan/004-persistent-offline-startup.md) | Persistent offline startup | Partial — shared cache and Windows cold/recovery checks passed; owner stopped further Android checks, Apple/Linux remain unqualified |
| [005](dev-plan/005-reconnection-and-cache-updates.md) | Reachability and safe updates | Partial — shared retry/update safety and Windows/browser acceptance passed; Android/Apple/Linux reconnection remain unqualified |
| [006](dev-plan/006-app-identity-and-theme.md) | Installed identity and appearance | Partial — shared identity/native appearance and Windows real OS/theme/restart checks passed; Android deferred, Apple/Linux and installed launcher qualification remain open |
| [007](dev-plan/007-platform-builds-and-release.md) | Platform builds and release acceptance | Partial — pinned release tooling and signing gates implemented; production hosting, credentials and remaining platform acceptance prevent release |

Set a step to **Partial** when implementation begins and **Completed** only after
its implementation and required acceptance checks pass. Keep its plan state in
sync. Record actual commands, results, platform evidence, and remaining work;
generated projects and documentation alone do not prove native support.

## 001 Foundation handoff — 26 October 2026

### Implementation and toolchain

- Generated all five requested native projects with Flutter **3.44.6 stable**,
  framework `ee80f08bbf97172ec030b8751ceab557177a34a6`, and Dart **3.12.2**.
  This is the installed verified baseline; current online Flutter documentation
  describes 3.47 separately in [the support matrix](docs/platform-support.md).
- `lib/main.dart` boots `GoalHintApp` in `lib/app.dart`. The startup screen uses
  the existing navy/paper colors and accessible, responsive app-name text.
  Product screens, authentication, data, and business logic remain in Next.js.
- The only runtime dependency is the Flutter SDK. The exact `flutter_lints` dev
  version and committed `pubspec.lock` provide repeatable package resolution;
  `pubspec.yaml` declares Dart/Flutter minimums and `.metadata` records generation.
- Windows host: Windows 11 25H2 x64, Visual Studio Community 2026 18.6, C++ desktop
  workload, MSVC 14.51, CMake 4.2.3, and Windows SDK 10.0.26100.0.
- Android host tools: API 36, build-tools 36.0.0, NDK 28.2.13676358, emulator
  37.2.12, and installed Microsoft JDK 17.0.20.8. No system toolchain relocation
  or global environment/security setting was required.

### Verification

Commands ran from `flutter/` unless otherwise stated.

| Check | Actual result |
| --- | --- |
| `flutter pub get` | Passed; no WebView runtime package added |
| `dart format lib test` | Passed |
| `flutter analyze` | Passed, no issues |
| `flutter test` | All four compact/desktop startup cases passed at 1× and 2× text scale |
| `flutter build windows --debug` | Passed; generated the x64 debug executable |
| Native Windows startup | Passed: runnable main isolate, first frame rasterized, inspector/render data confirms `GoalHintApp` and laid-out app-name text; no runtime error markers |
| Android Java selector probe | Passed with process-local JDK/temp normalization |
| `gradlew help --stacktrace --no-daemon` | Passed with the same scoped environment |
| `flutter build apk --debug` | Passed with the scoped environment; debug APK generated |
| Android native startup | Not tested: the owned read-only API 36 emulator did not finish booting within 120 seconds; no APK was installed |
| iOS and macOS builds/runs | Untested: this host has no macOS/Xcode environment |
| Linux build/run | Untested: this host has no Linux/GTK native build environment |

Foundation acceptance is complete for the available runnable Windows target; this does not claim five-platform runtime or WebView completion. Android APK compilation is verified, while no usable Android runtime was connected or booted for an app-start check. The owned emulator was shut down and its ports/process were confirmed gone, preserving its saved state.

The native Windows check used a hidden owned test process and debug VM/inspector
frame evidence, not a visual screenshot review. The process was closed after
verification. Logs, sanitized smoke evidence, temporary fixtures, binaries, and
SDK path files are local under ignored `.dart_tool/`/`build/` directories.

### Android host findings and workaround

The inherited `JAVA_HOME` points to a missing JDK. Selecting the installed JDK
for the process avoids that stale setting. The first Gradle attempt then failed
before compilation with `Unable to establish loopback connection` through Java
NIO `UnixDomainSockets.connect0`. An IPv4-only option did not resolve it.

Setting `TEMP`, `TMP`, and `-Djava.io.tmpdir` to an absolute, ignored
`.dart_tool/jtmp` directory for that process resolved the selector probe, Gradle
startup, and APK build. The inherited paths were native short Windows paths, so
no particular shell product or `/tmp` leak is assumed as the cause. Reproduction
commands are in [the README](README.md); no JVM workaround was hard-coded into
committed Gradle properties.

Flutter doctor still reports the SDK path's spaces as an NDK tooling risk. The
build also reports SDK XML/deprecation compatibility warnings; these did not
prevent the foundation debug build. Retain these findings for future native
plugin validation rather than treating this APK as WebView support evidence.

### Integration decision and next work

The [primary-source support matrix](docs/platform-support.md) selects an
integration direction: prefer the official system-WebView plugin for
Android/iOS/macOS, prototype a small WebView2 adapter for Windows, and explicitly
prototype Linux CEF/WebKitGTK before claiming Linux embedding. No package is
claimed to cover every target, and none is installed by this foundation step.

**002 is next.** Implement central environment/URL selection and document actual
device addresses. Its installed-host URL-loading evidence depends on the WebView
integration in 003; complete that combined check there rather than duplicating
screens or advancing integration implicitly. Offline work remains coordinated
with [web 069](../next-js/dev-plan/069-offline-shell-support.md) and Flutter
004–005. Generated icons/identifiers are provisional until 006; distribution and
per-platform acceptance belong to 007.

## 002 Environment handoff — 26 October 2026

### Implementation

- `lib/config/app_config.dart` is the single public environment/origin resolver.
  Debug defaults to development: Android uses `http://10.0.2.2:3000`, other
  targets use `http://localhost:3000`. `APP_ENV` and `DEV_APP_ORIGIN` are public
  compile-time defines, with no runtime dependencies or copied web secrets.
- Profile/Release default to the fixed `https://goalhint.com` origin. They
  reject development configuration. Production rejects any development override,
  including an empty one. Validation rejects unsupported schemes, credentials,
  non-origin paths, queries/fragments, invalid ports, and malformed hosts.
- `main.dart` passes valid configuration to `GoalHintApp`; a typed validation
  error produces an accessible error screen without echoing input. The existing
  valid startup screen remains until WebView integration in 003.
- Android declares Internet access for all variants, with cleartext HTTP allowed
  only in Debug. iOS/macOS Debug-specific plists allow local development HTTP
  with local-network usage text and loopback/private-address exceptions;
  Profile/Release retain their normal plists and certificate validation.
  macOS has outgoing-network sandbox entitlement in Debug/Profile and Release.
- Next.js development origins now include explicit IPv4/IPv6 loopback and the
  Android emulator host alias alongside the existing private LAN pattern.
  [The guide](docs/development-urls.md) explains server binding, target routing,
  public defines, native policy, and platform limitations.

### Commands and observed results

Commands ran from `flutter/` unless another location is stated. The previously
documented process-local JDK/temp setup was also used for the Android build.

| Check | Actual result |
| --- | --- |
| `dart format --output=none --set-exit-if-changed lib test tool` | Passed |
| `flutter analyze` | Passed, no issues |
| `flutter test` | All 21 tests passed: resolver validation, startup/error UI, native security configuration |
| `dart run tool/resolve_origin.dart` | Development, `http://localhost:3000` |
| `dart run --define=APP_ENV=development --define=DEV_APP_ORIGIN=http://192.168.1.148:3000 tool/resolve_origin.dart --android` | Development, selected LAN origin |
| `dart compile exe tool/resolve_origin.dart -o .dart_tool/url-checks/production-origin.exe`, then execute it | Production, `https://goalhint.com` |
| AOT compile with `--define=APP_ENV=development`, then execute | Exited 64 with the debug-only development configuration error |
| `flutter build windows --release` | Passed; x64 Release executable generated |
| `flutter build apk --release` | Passed; APK generated without development defines |
| Android compiled Release manifest and signature inspection | Internet permission present, target API 36, no cleartext/debuggable override or network security config; effective platform defaults deny cleartext and debugging. Signature verified with the template Android Debug certificate; local build validation only |
| Apple source plist parse and configuration tests | Passed: Debug-only exceptions, matching shared metadata, Profile/Release selection, and macOS outgoing-network entitlement separation |
| Host GET `/en` via loopback and LAN | HTTP 200 with the Goal Hint page |
| Physical TECNO CL8, Android API 35, Wi-Fi LAN GET `/en` | HTTP 200 with the Goal Hint page, using central resolver origin `http://192.168.1.148:3000` |
| Same physical phone GET of `/_next/static/chunks/main-app.js` with LAN Origin/Referer | HTTP 200 |
| Next.js dev WebSocket upgrade from localhost, IPv4/IPv6 loopback, emulator alias, and LAN Origins | All trusted origins returned HTTP 101; an unrelated external origin was blocked |
| Next.js `npm run lint` and `npm run typecheck` | Passed |

The Next.js server listened on port 3000 on the development computer, whose
observed LAN address was `192.168.1.148`. The phone used the same Wi-Fi network;
the address is an observation, not a permanent project setting. Device probes
used anonymous HTTP requests through `adb`/Toybox and sent no account cookies.
Those address probes needed no phone app installation, USB reverse mapping, or
firewall changes; installed-app checks followed in 003 below.
Logs, probe output, APKs, executables, and other generated evidence remain in
ignored `.dart_tool/`, `build/`, and web output directories.

### Installed-loading acceptance completed during 003

Configuration implementation, the recorded Release builds, and desktop/physical
Android HTTP reachability were verified in 002. Its remaining installed-loading
acceptance is now satisfied: the adapters from 003 load the existing Next.js app
in the Windows shell and physical Android shell using this same resolver.
Windows used desktop loopback; Android used the development computer's LAN
origin on port 3000. **002 is Completed for those available targets.** HTTP
probes alone were not used to qualify embedded loading. Detailed account,
navigation, and platform acceptance remains tracked under 003.

Apple native builds, signed-plist inspection, and physical Apple network/privacy
checks require macOS/Xcode and Apple hardware. Linux native execution remains
untested on this Windows host. Verify those targets during their adapter/build
work; the source-policy tests do not qualify their native runtime behavior.
Offline startup and reconnection remain 004–005; identity and distribution
remain 006–007. No WebView or offline package was introduced by this step.

## 003 Embedded-web handoff — 26 October 2026

### Integration boundaries

- `WebAppShell` owns initial loading, retryable errors, native back/history,
  lifecycle reconciliation, safe areas, and external URL handoff. It uses the
  configured origin directly. Next.js still owns every product screen, route,
  query, form, account rule, payment, authorization decision, and content theme.
- Android/iOS/macOS use official `webview_flutter` 4.14.1, Android 4.14.1 and
  WKWebView 3.26.2. Windows directly uses the locally patched Windows 0.6.0
  WebView2 adapter; its source/license/provenance and native guard tests live in
  `packages/flutter_inappwebview_windows/`. See
  [the integration guide](docs/web-app-integration.md).
- Only the exact configured origin may own embedded documents. Safe external
  destinations go to the operating-system handler. Unsafe schemes and
  credential-bearing navigation are blocked. The Windows native guard also
  covers non-network navigation and popups; its unused JavaScript bridge is
  disabled. The system adapter adds no Dart JavaScript channel.
- Native browser stores are retained across disposal/reopen. Windows uses an
  app-owned support-directory profile separated by environment; other targets
  use their normal persistent stores. Resume updates history capability without
  reloading unfinished forms. Server cookies, expiry, roles, and revocation
  remain authoritative. No native credential store was added.
- Android additionally commits its ordinary WebView cookie store at page and
  background/suspend checkpoints using native `CookieManager.flush()` on a
  background executor. The no-argument Flutter method channel accepts no token
  or cookie data and exposes no JavaScript bridge. Native `onStop` is a fallback.
  The test awaits the same suspend checkpoint before the host stops the process,
  modeling normal background/close behavior rather than an unfinished abrupt
  kill. Persistent server cookie flags and authorization are unchanged.
- Android HTML file inputs use the official system document picker through
  `file_selector` 1.1.0, with accept filters, multiple selection, and cancellation.
  Capture hints fall back to that picker; no broad storage/camera permission or
  native proof-validation logic is introduced. Manual picker use remains open.

### Observed execution

All fixture accounts and codes below are synthetic. The copied Next.js member
fixture uses the existing web HTTP adapters and scripted services, without a
database, message delivery, payment, or real account change. The native test
guards its fixture before writes. [Reproduction commands and limits](integration_test/README.md)
describe first/reopen/live phases and the required `--no-uninstall` flag.

| Check | Actual result and evidence |
| --- | --- |
| Windows native fixture first phase | Passed: route/query preservation, trusted native pointer navigation and back, unfinished input across resume, external-link handoff, unsafe native navigation rejection, login/register/code forms, reload cookies, account-change HTTP transport, role/expiry/logout checks. `windows-first-stable.log` |
| Windows separate cold-process reopen | Passed with the same profile and no uninstall/data clearing; the server recognized the retained synthetic member cookie, then logout cleared access. `windows-reopen.log` |
| Windows untrusted local HTTPS certificate | Passed: certificate refusal, native Retry, and a clean test teardown against an isolated self-signed local server. No OS trust changes. `windows-tls-error-clean.log` |
| Windows browser engine | WebView2 Runtime **155.0.4283.62**, read through the built loader API used by the adapter |
| Windows complete live Next.js app | Passed with a clean exit: real app rendering, normal/doubled document-text overflow checks, native pointer focus, controlled web input and native back. `windows-live-pass.log` (73.8s build, 20s test). Normal native dark-theme rendering and Goal Hint title also visually confirmed |
| Windows actual keyboard and window resizing | Not yet qualified by manual native input/resizing evidence; synthetic DOM input is not an actual keyboard check |
| Physical Android complete live app | Passed installed rendering from `http://192.168.1.148:3000` on TECNO CL8, Android API 35 / System WebView **155.0.8059.43** |
| Android external destination | Passed: `https://flutter.dev` opened Chrome through the host, and native Back returned with the document preserved. `android-external-summary.json` |
| Android synthetic first phase | Passed wirelessly: query/history, native PopScope back, resume/input, external/unsafe links, login/register/code forms, account-change HTTP transport, admin gates, expiry and logout. `android-store-first.log` (58.7s build, 11.1s install, 14s test) |
| Android separate cold-process reopen | Passed after the ordinary browser-store suspend checkpoint: retained membership was recognized by the server, then the existing web logout cleared access. `android-store-reopen.log` (59.2s build, 9.8s install, 2s test). Both phases used `--no-uninstall`; no preferences/token copy or authorization bypass |
| Android persistent cookie attributes | Actual fixture response confirmed `Path=/`, `HttpOnly`, `SameSite=Lax`, `Max-Age=34560000`; cookie values were redacted. The flush correction changes durability, not server lifetime/flags. `fixture-cookie-attributes.json` |
| Android wireless debugging | Modern Android TLS pairing/connection completed with the owner-provided one-time code. Explicit Wi-Fi transport selected and TECNO CL8/API35 verified with `getprop`; mDNS connection also worked. Pairing codes/real device identifiers are not committed |
| Android fixture routing | LAN port 3187 was unreachable on this network. An owned temporary `adb reverse` mapping over wireless ADB made `http://127.0.0.1:3187` reachable for both fixture phases. Normal app port 3000 works over LAN/Wi-Fi without USB or this mapping; no firewall policy was changed |
| Android bottom safe area | Measured and corrected: native viewport already excluded 40px while CSS added the same 40px again. Android-only `SafeArea(bottom: false)` increased viewport height from 810 to 850 CSS px; the web's 56px tab targets stay above the OS bar without extra visible blue padding. Shared web/iOS safe-area CSS is preserved. `android-nav-metrics.json`, `android-compact-sequence-9.png` |
| Final source checks | Passed after the browser-store addition: `dart analyze lib test integration_test` reported no issues, all 30 Flutter tests passed, and formatting checked 20 files with zero changes. `.dart_tool/final-source-checks.log` |
| Fresh current Windows Release | Passed `flutter build windows --release --no-pub -t lib/main.dart` without Dart defines; current executable and Goal Hint identity built. The default selects fixed production HTTPS. `windows-release-current.log` |
| Final normal Windows Debug restore | Passed with the normal app entry point and development origin after native tests. `windows-normal-debug-final.log` (49.7s) |
| Final normal Android Debug restore | Normal app with the browser-store fix rebuilt and installed wirelessly after the fixture pair; it uses LAN port 3000. `android-store-normal-build.log` (35.4s build) |
| Fresh current Android Release | Passed `flutter build apk --release -t lib/main.dart` without environment defines (275.1s, 44.7MB). Compiled label, adaptive/monochrome icons, INTERNET permission and HTTPS-only Release policy verified; no debuggable or development transport override. It uses the fixed production origin. `android-current-release-regenerated.log`, `android-release-audit.json`. Existing template Debug signing is local build qualification only; Release was not installed over the working development app |
| Apple execution and Linux embedding | iOS/macOS runtime tests require macOS/Xcode; Linux has no qualified adapter or Linux/WSL host here. Explicit unavailable-browser feedback remains on unimplemented targets |

Logs, captures, local TLS material, executables/APKs, fixtures, and browser profiles
remain in ignored local output directories. Evidence names above refer to
`.dart_tool/integration-checks/`; they are not distributable fixtures or committed
account data. Remove only the owned temporary device mapping when testing ends.

The owned fixture server on port 3187 and the local TLS helper have been stopped;
the normal Next.js development server on port 3000 remains available. Final
wireless readback confirmed API35, with both ADB forward/reverse lists empty.
The authorized wireless pairing/connection is preserved.

### Open acceptance and offline handoff

**003 remains Partial.** Available Windows and Android functional lifecycle and
cold-process reopen checks have passed, including the corrected live Windows
phase. Complete real keyboard/window and picker checks, Apple qualification,
and a Linux engine prototype before claiming the full platform requirement.
Fixture account changes exercise transport against scripted services; they do
not qualify production phone/password changes or real message delivery.

Persistent profiles, trusted-origin policy, lifecycle preservation and load/error
signals are ready for 004. No service worker/cache contract, offline cold start,
eviction recovery, or update mechanism is implemented by this step. Coordinate
that work with [web 069](../next-js/dev-plan/069-offline-shell-support.md).

## 006 Identity and launch handoff — 26 October 2026

The owner requested correcting installed names/icons and a white launch/loading
surface while 003 qualification was in progress. **006 remains Partial.**

- `node flutter/tool/generate-icons.mjs` reuses the shared **primary** Goal Hint
  SVG and the web project's pinned Sharp dependency. It preserves the original
  cyan/navy colors, proportions and clear space. It generates legacy/adaptive/
  monochrome Android artwork, Apple asset catalogs, a multi-size Windows ICO,
  and Linux icon/desktop assets. No separate Flutter artwork or navy icon tile
  remains. [Generation and platform details](docs/app-identity.md).
- Android/iOS launcher formats use white; macOS/Windows/Linux use transparency.
  Android's adaptive foreground respects its native safe zone. Display names
  and public window/product metadata use **Goal Hint**. Existing application,
  package and bundle IDs remain unchanged to preserve installed update/profile
  continuity; final store identity/signing acceptance remains open.
- Android 12+ day/night splash resources and the shared Flutter loading surface
  use white, including under dark OS appearance. The OS splash uses the mark
  and wordmark; the Flutter view implements branding, loading text and animation
  with reduced-motion handling. Product content still follows the website's
  theme rather than a competing native preference.

| Identity check | Actual result |
| --- | --- |
| Android installed cold OS startup, dark OS | White mark/wordmark splash visually confirmed in `android-white-startup-0.png` |
| Android compiled identity | `aapt` verified Goal Hint label and adaptive/white launcher resources in the built APK |
| Android visible normal app | Full Next.js UI and compact bottom inset visually confirmed in `android-compact-sequence-9.png` |
| Android Flutter loading animation | Passed on the installed final debug build: white logo, Goal Hint name, cyan spinner and Loading text captured at 3.92s in `android-raster-sequence-5.png`; full Next.js app/compact bottom navigation visible by frame 11. `android-raster-normal-build.log` |
| Windows normal app identity | Goal Hint window title and shared web theme visually checked. Fresh Release build passed; its associated icon was visually checked as the Goal Hint mark and product/file metadata uses Goal Hint |
| Installed launcher masks, dock/taskbar and complete appearance lifecycle | Full manual masking, light/dark system-bar, native keyboard, theme-change/reload/restart checks remain incomplete |
| iOS/macOS/Linux identity | Artwork/metadata updated in source; native installed appearance untested on this Windows host |

Keep remaining splash/loading evidence, platform appearance checks and stable
store identifiers explicit for [007](dev-plan/007-platform-builds-and-release.md).
Generated assets alone do not qualify every installed platform.

## 004 Persistent offline startup — 26 October 2026

### Shared contract and native boundary

[Web 069](../next-js/dev-plan/069-offline-shell-support.md) and its
[cache contract](../next-js/docs/offline-startup.md) own the implementation.
Flutter continues opening its configured origin in the existing persistent
system/WebView2 profile. No production Dart adapter, native content database,
asset server, JavaScript bridge or extra native permission was added. The
reusable `integration_test/support/native_page.dart` supplies test-only
controller/DOM access for both native harnesses.

The complete viewer-independent `/offline` entry, compatible hash-pinned assets
and explicit anonymous snapshot are staged before activation. The snapshot
holds at most 30 basic fixtures/128 KiB with a maximum 24-hour display lifetime
and visible saved timestamp; at most two 10 MiB bundles plus small metadata and
browser overhead remain. Root and `/en` fall back to **Saved matches**, not
subscriber Best Slips. `/en/matches` without a query is the supported saved feed;
uncached routes explain the connection requirement. The shared web components
render real permitted data, rather than a screenshot or native replica.

Predictions, prices, remote media, identity/entitlements, account/payment data,
passwords, verification codes and credentials are excluded. Existing normal
HTML/RSC and private/no-store API policies remain intact. No writes are queued
or replayed. Normal browser cookies stay separate and server authorization
remains authoritative. This viewer-independent store has no account-specific
content to disclose after logout or switching users.

Native cache inspection checks same-origin approved entry/asset/snapshot URLs
and rejects private/no-store network responses. Exact worker-created
`/offline-cache/active` and `/offline-cache/record` records are internal
integrity/pointer metadata, not fetched application responses. Corruption tests
modify only those records; eviction deletes only owned `goal-hint-offline-*`
caches. Cookies, unrelated stores and the profile are retained.

### Observed qualification

Native runs retained the installed app/profile with `--no-uninstall` and used
separate application processes. Before Windows cold runs, no owned Goal Hint or
WebView2 process remained. Its fixture server was stopped so no app-origin
request could succeed; Wi-Fi stayed available. This is an app-origin outage,
not an airplane-mode/radio-disable claim. The fixture serves actual built
Next.js UI, worker and assets with a synthetic anonymous snapshot and no real
account/payment mutations or private database reads. See
[reproduction commands](integration_test/README.md#durable-offline-startup).

| Check | Actual result and evidence |
| --- | --- |
| Browser | Chrome 156 production-like fixture passed full browser-process cold restart, dated saved rendering, uncached routes, rejected writes, private identity A/B plus logout exclusions, missing required JS, corrupt entry, eviction, one-byte quota failure and recovery. A real old-to-new manifest upgrade preserved the active document/input. Exact browser/source results are linked from [web 069](../next-js/dev-plan/069-offline-shell-support.md) |
| Current installed engines | WebView2 **155.0.4283.62** re-read through the built loader API; TECNO CL8/API35 Android System WebView **155.0.8059.43** re-read from its provider. `runtime-versions.json` |
| Windows first-ever offline visit | Passed: real browser initialized without a usable document/server and native Retry appeared. `windows-first-offline.log` |
| Windows online preparation and separate cold reopen | Passed: active controlling worker, committed bundle, dated saved UI, actual approved CacheStorage content and no offline POST/password form. A new process rendered with its server stopped and native adapter error absent. `windows-online.log`, `windows-offline.log` |
| Windows uncached/corrupt recovery | Passed with server stopped. Unknown navigation recovered; deliberately corrupting every retained owned bundle integrity record replaced saved rendering with recovery. `windows-uncached.log`, `windows-corrupt.log` |
| Windows final current clock-tolerant source | Passed connected preparation (108.1s build/8s test), then a separate process first rendered the saved app with its server stopped and scoped cache eviction produced recovery (69.6s build/5s test). `windows-final-online.log`, `windows-final-evicted.log` |
| Android first-ever offline visit | Passed over paired TLS wireless ADB: real browser initialized with no usable cache/server and native Retry appeared (106.4s build, 10.5s install, 3s test). `android-first-offline.log` |
| Android preparation diagnostic | Secure-context/API checks passed and registration was activated/controlled the loopback origin. Preparation returned safe `invalid-snapshot` while a server/device comparison showed roughly a one-second difference including second rounding. The shared worker/view now tolerate up to five minutes of comparison skew; no device clock was changed. `android-online-retry.log`, `android-diagnostic.log`, `android-clock-comparison.json` |
| Android final fixed online/cold/recovery | **Not verified.** The owner requested finishing without further Android checks after the shared clock fix. Registration and first-use Retry are not proof of a prepared bundle or offline cold restart. Earlier secure-lock/VM-service startup failures were test setup issues, separate from the later preparation diagnostic |
| Android cleanup | Normal `lib/main.dart` Debug APK restored with LAN port3000 and replace-install succeeded. This was cleanup only, without new runtime/device validation. Owned fixture reverse3189/debug forwards removed; wireless pairing retained. No display-timeout, secure-lock or clock setting changed. `android-normal-restore.log`, `android-cleanup.json` |
| Final Flutter source checks | Passed: `dart analyze lib test integration_test` reported no issues, all 30 unit/widget tests passed, and formatting checked 22 files with zero changes. `flutter-source-checks.log` |
| Normal Windows cleanup | Normal `lib/main.dart` Debug executable restored at development loopback port3000 after native tests (37.2s build). `windows-normal-restore.log` |
| Apple and Linux | No Apple host/device execution or qualified Linux embedded engine. WK app-bound-domain/minimum-version behavior still needs a native prototype; runners, package support and browser tests do not prove offline startup |

Native logs and sanitized metadata above remain in ignored
`.dart_tool/offline-checks/`; pairing codes, device identifiers, profiles,
executables/APKs and runtime/cache output are not committed. Owned fixture
servers are stopped for offline phases and cleaned up afterward, preserving
normal development services.

### Status and handoff

**004 remains Partial.** Windows has installed cold-start/recovery evidence;
Android's final fixed preparation/cold startup remains unverified because the
owner stopped further checks. Apple qualification and Linux embedding remain
open. Shared browser/source checks do not replace those native results.

Normal `next dev` and LAN HTTP remain online/HMR development; use production
HTTPS or a secure production-like build for offline startup. Keep the same
origin/profile across preparation and cold runs; do not copy cookies or cache
files between origins. See [native setup](docs/offline-startup.md) and continue
remaining lifecycle/reconnection/release checks in
[005](dev-plan/005-reconnection-and-cache-updates.md) and
[007](dev-plan/007-platform-builds-and-release.md).

## 005 Reachability and safe updates — 26 October 2026

### Implementation

The [shared web contract](../next-js/docs/offline-startup.md) now owns one
reachability/retry controller. Validated same-origin reads determine success;
connection hints alone neither establish success nor prevent probing. Backoff
is 5/15/30/60 seconds then five minutes, with Retry-After, a two-second start
minimum, recent-success hint suppression and cancellation when hidden/disposed.
Complete candidates activate atomically; failures retain the exact prior bundle.
The active document is not reloaded and waiting workers are not forcibly
activated. Authentication and private/no-store rules remain unchanged, without
queued/replayed writes. See [005](dev-plan/005-reconnection-and-cache-updates.md).

Actual Windows OS minimize/restore exposed missing document visibility in the
texture WebView host. `lib/web/windows_web_view.dart` now uses the selected
plugin's existing pause/resume APIs. `web_app_shell.dart` coalesces hidden/paused,
orders native calls, remembers hidden startup and skips work after disposal;
the Windows adapter also remembers visibility before its controller attaches.
This is native lifecycle glue, not a second refresh loop/cache/JavaScript bridge.
Two meaningful widget tests cover pending suspension/resume ordering, duplicate
background states, hidden initialization and disposal.

### Native evidence and boundaries

`integration_test/reconnection_test.dart` and reusable support helpers retain
the real WebView2 development profile at an isolated secure loopback origin.
The actual built shared web UI/worker sits behind an owned fault proxy; its
snapshot and private route are synthetic. B is a coherent derived acceptance
generation with a new required asset, not a second independent release build.
No real account/payment writes, radio changes or private database reads occur.

| Check | Actual result |
| --- | --- |
| Engine | Windows 11 x64; actual document UA reported Chrome/Edge 155 |
| Shared browser | Chrome 156.0.8078.48 passed 5/15/30/60/300-second backoff, false connectivity hint with successful reads, offline/online recovery, failed/missing/truncated candidate responses, lock contention and page-exit cancellation; separate browser processes cold-started exact A then B. Browser draft preservation is not claimed; native draft proof is below. See [web 069](../next-js/dev-plan/069-offline-shell-support.md) |
| Seed A | Passed; valid controlling worker and exact version/capture/expiry/data identity retained. 74.8s build/11s test; `windows-seed.log` |
| Failed updates and hints | Passed 503, captive response, 401, missing required B asset, eight-second timeout and truncated body; exact A and draft survived. Genuine automatic retry respected the five-second delay; CDP/synthetic repeated connection hints preserved retry timing and manifest count. 84.1s build/43s test; `windows-failures.log` |
| Disposal | Held new-asset request aborted after 209 ms and no later manifest request appeared. An independent proxy-record audit confirms this preceded the normal eight-second deadline. Stricter source assertions added afterwards were not rerun; worker/browser cancellation tests cover lease semantics. `cancellation-audit.json` |
| Cold A and real lifecycle | New process with proxy stopped rendered exact A. The first coordinated run exposed missing browser hidden events; after native lifecycle fix, actual OS minimize/restore produced Flutter hidden/resumed and document hidden/visible. A later 100s wait was shorter than valid five-minute retry cooldown; the acceptance bound was corrected without changing production backoff |
| Current-source recovery B | Passed automatic complete B activation after proxy restoration while actual test-WebView `navigator.onLine` stayed false. Unsent DOM draft, nonce, path/history, focus, selection and scroll stayed unchanged. Private GET returned 401/no-store, failed synthetic POST count remained 1. 137.6s build/2m04s test; `windows-recover-final.log` |
| Current B cold restart | Passed new process with proxy stopped: exact saved B rendered and failed POST was not replayed. 173.1s build/8s test; `windows-final-cold.log` |
| Flutter source checks | All 32 unit/widget tests passed, including the two new lifecycle checks; `dart analyze lib test integration_test` reported no issues; formatting checked 24 files with zero changes. `flutter-source-checks.log` |
| Normal Windows cleanup | Passed normal `lib/main.dart` Debug rebuild at development loopback port3000 (115.3s), replacing the integration-test executable; no further runtime/device check. `windows-normal-restore.log` |

The connection hint override uses only the owned test WebView's CDP protocol;
actual server outage/invalid HTTP establishes unreachable or unusable access.
This does not claim OS Wi-Fi/mobile-data switching. The draft is scripted DOM
input, not a native-keyboard acceptance result. Controls, logs, stats, profiles,
fixture bundles and binaries remain ignored. Reproduction and operator
checkpoints are in [the native guide](integration_test/README.md#reachability-and-safe-updates).

**005 remains Partial.** Windows and shared-browser evidence qualify available
hosts, not every native target. Android execution remains stopped at the
owner's request; no further device check or setting change was made. Final
Android offline/reconnection qualification, Apple native execution, Linux
embedding and release acceptance remain open. Keep normal online development
on its existing origin and use a secure production-like build for cache checks.

## 006 Installed identity and native appearance — 26 October 2026

### Shared implementation

Goal Hint display names, canonical brand artwork and stable public application
identifiers remain shared with the website. The generator/audit covers 45 native
asset outputs and 56 static checks. This verifies file formats, artwork and
resource/identity wiring; it does not qualify a platform's installed masking.
See [the identity guide](docs/app-identity.md) for generation and identifier details.

Versioned public web metadata now drives native feedback colors and desktop
decorations through trusted, read-only native sampling. The existing web theme
preference and system fallback remain authoritative; no native preference or
web-callable command bridge was added. The white logo/name/loading launch surface
is retained in both OS appearances. Android edge-to-edge navigation protection
paints the reported inset without adding a second layout inset; current-source
device rendering is explicitly unverified after the owner's deferral.

### Available-host evidence

The isolated fixture uses the real root providers, brand and website theme
button, with no accounts, database or private services. Two Windows processes
retain their origin/profile with `--no-uninstall`. Operator-controlled startup
and appearance checkpoints extend observation time; their durations are not
startup-performance measurements.

| Check | Actual result |
| --- | --- |
| Runtime | Windows 11 x64; actual WebView2 document UA reported Chrome/Edge 155 |
| Shared brand and native identity | Generator outputs/static checks passed; Goal Hint window title and window icon were visually inspected. Installed/pinned shortcuts, taskbar identity, dock and packaging are not claimed |
| White launch with OS dark | Passed visual logo/name/spinner inspection in the actual native window; startup was held by the test-only initialization gate |
| Actual OS fallback switch | Passed actual Windows Settings dark → light change: before dark/after light web CSS, public metadata and every native color matched, with the fixture's theme key remaining absent |
| Explicit website preference | The actual shared theme button selected and stored light/dark. Dark web content and dark native caption were visually captured while Windows remained light |
| Document reload | Dark persisted after a real reload, guarded by a changed `performance.timeOrigin` before assertions |
| First process | Passed: 75.6s build, 6m07s operator-gated test; host PID 33952 and its owned browser children exited before the second process |
| Separate-process restart | Passed: 103.5s build, 2m44s operator-gated test, host PID 33484. White startup was captured under OS light; stored dark and matching native appearance survived in the same profile despite the light OS |
| Cleanup | Only the fixture origin's theme key was removed, followed by a verified light OS fallback reload. The operator restored original Windows Apps/System dark values and ColorPrevalence 0 through Settings, then verified them. Normal `lib/main.dart` Windows Debug loopback-port3000 rebuild passed (51.3s) |
| Source checks | All 42 Flutter unit/widget tests passed; full Dart analysis was clean and formatting checked 29 files without changes. Six shared-web contract tests, full web lint/typecheck and the production build passed (22 pinned offline assets), along with the isolated fixture build. The synthetic member fixture's intentional full-document reset has a documented lint exception; its behavior was unchanged |

Ignored visual evidence is in `next-js/output/identity-006/`:
`windows-startup-os-dark.jpg`, `windows-system-light.jpg`,
`windows-explicit-dark-os-light.jpg`, `windows-startup-os-light.jpg`, and
`windows-reopen-dark-os-light.jpg`. Control files, public snapshots, logs,
profiles and binaries remain ignored. See
[the reproduction flow](integration_test/README.md#installed-identity-and-appearance).

**006 remains Partial.** The owner explicitly deferred further Android checks
again for this task. Apple compilation/runtime and Linux embedding remain
unqualified. Installed/pinned launcher/taskbar/dock identity, platform masking,
release packaging and signing remain with [007](dev-plan/007-platform-builds-and-release.md);
window inspection and static assets are not substitutes for those checks.

## 007 Platform builds and release acceptance — 26 October 2026

### Build and installation implementation

[The release guide](docs/releases.md) documents the pinned Flutter 3.44.6 /
Dart 3.12.2 toolchain, actual host tools, project target settings, normal
development/production commands, artifacts and native signing boundaries.
`release-toolchain.json` records the exact SDK revision; the lockfile is retained.
The website remains at `https://goalhint.com` in production, as the owner confirmed
after the hosting probe returned HTTP 403 / Account Suspended.

Windows tooling under `tool/windows/` builds or packages only the normal
`lib/main.dart` production Release configuration with the pinned SDK. It adds
Microsoft-signed application-local CRT libraries from Visual Studio's Redist
directory, verifies executable identity/version, excludes debug/test/private
output, records SHA256/provenance and produces an unsigned ZIP candidate.
The installer verifies extracted files and the Evergreen WebView2 prerequisite,
stages versioned per-user files, and creates Goal Hint shortcuts. The bounded
uninstaller removes manifest-owned app files and managed shortcuts while leaving
the browser profile outside its scope. No certificate, trust setting, global
environment or store registration is created or changed.

Android Release now requires explicit local/secured signing values and fails
before release work when they are missing or the keystore is absent. It never
falls back to the Android Debug key. Development builds remain independent.
[Android release notes](docs/android-release.md) record exact property/environment
precedence and verification commands. No signing material is committed.

### Actual available-host evidence

Commands ran from `flutter/`. The host is Windows 11 25H2 x64, OS
10.0.26200.9711, Visual Studio Community 2026 18.6.0, MSVC/CRT 14.51, Windows SDK
10.0.26100.0, and the existing NuGet setup. Android tools remain API/build-tools
36/36.0.0, NDK 28.2.13676358 and Microsoft JDK 17.0.20.8 with the documented
process-local JDK/temp/Kotlin workarounds. Doctor still reports spaces in the
SDK path; no SDK relocation was performed.

| Check | Actual result |
| --- | --- |
| Source verification | Full `flutter analyze` clean; all 42 Flutter unit/widget tests passed. Dart formatting checked 30 files; the new test was formatted before its native run. No shared production Next.js source or lockfile changed |
| Windows release guards | 37 dependency-free safety/configuration checks passed on both PowerShell 7 and actual Windows PowerShell 5.1; scripts parse. They cover paths/links, hashes, unknown-file preservation, production target/define rules and missing Runtime failure |
| Windows normal production build | `flutter build windows --release --target=lib/main.dart --dart-define=APP_ENV=production` passed in 762.3s. Existing third-party WebView2/plugin C4458/C4244 warnings remained non-fatal; no compiler-check weakening was introduced |
| Windows package and extraction | Pinned-SDK `tool/windows/package.ps1 -SkipBuild` passed against that fresh build and the installed Microsoft.VC145.CRT x64 directory. ZIP extraction and verification passed for all 30 manifest files |
| Actual per-user installation | Extracted package installed with Windows PowerShell 5.1 into `%LOCALAPPDATA%/Programs/Goal Hint/versions/0.1.0+1`. Start Menu/desktop shortcut target and bundled-executable icon references matched. Registered Evergreen Runtime was 155.0.4283.62 |
| Installed production launch | **Fail**: owned Release process PID 31388 displayed the provider's Account Suspended page at the retained production origin. Window name/icon were inspected, but no successful Goal Hint online launch, production cache preparation or release is claimed |
| Actual uninstall | Closed the owned app and ran its hash-matched packaged uninstaller. Managed application root and both created shortcuts were removed; the existing production browser-profile directory and its creation identity were retained. Unknown-file preservation is separately qualified by the synthetic guard suite |
| Android current-source debug APK | Passed `assembleDebug` in 174.2s; manifest/signature inspection confirmed Goal Hint, ID `com.goalhint.goal_hint`, version 0.1.0+1, min SDK 24/target 36, arm32/arm64/x64 libraries and expected debug/cleartext flags. No phone was contacted or changed |
| Android secured-signing gates | Missing signing rejected at actual `:app:preReleaseBuild` (exit 1, 14s); synthetic absent-keystore environment rejected (exit 1, 12s). APK/AAB dry-run graphs included the gate (27s). These are successful negative checks, not release artifact creation |
| Independent website update | Passed one actual Debug native process, PID 26704, through independently built Next.js A and B at `http://127.0.0.1:3194`. Build IDs differed, document time origins changed, and all 16 executable/DLL/data SHA256 values matched; a 17th entry explicitly records absent Debug `data/app.so`. Generic web bridge remained undefined. Both UI generations were visually inspected |
| Website update timing/scope | Native build 61.8s; operator-gated test passed in 1m25s. A build ID `LF2vpNkAN-NIonE0v640h`, B `JrmJPDgVuJhrr6g5p55iT`. Both were real isolated Next.js production builds using shared providers/branding, with no account/database services; this is Debug development delivery evidence, not deployed-production or Release-cache acceptance |
| Normal development restoration | `flutter build windows --debug --target=lib/main.dart --dart-define=APP_ENV=development --dart-define=DEV_APP_ORIGIN=http://127.0.0.1:3000` passed in 33.9s. No native test host/browser children or owned fixture port 3194 listener remained |

### Artifacts and provenance

The local unsigned Windows candidate is
`build/releases/goal-hint-0.1.0+1-windows-x64.zip` (13,438,085 bytes), with adjacent
`.sha256` and extracted bundle/manifest. ZIP SHA256:
`8395c761296d8d0694d4f7e80327d92f6846d7be09615cc5a249955fe8eb67da`.
Its manifest truthfully records source `faf295104ba31981fb2c5df06de931c8aad25241`
with `dirty: true` for this working implementation and the pinned toolchain.
Checksums establish byte consistency, not publisher authentication. No usable
local Windows code-signing certificate/selector was found; nothing was signed,
uploaded or published. Future candidates must be rebuilt from their intended
revision and version rather than relabeling this validation archive.

The Android debug APK is `build/app/outputs/flutter-apk/app-debug.apk`
(184,924,557 bytes), SHA256
`7b302ba5393009b94e6371a866b127805e10ceba35557fb384ba18b7cf6b208b`.
Older Release APK copies dated 17:00:58/59 were left untouched and are stale,
prior debug-signed validation output. No current signed APK/AAB was produced.

Ignored `.dart_tool/release007-*.log` files hold build/install/test output.
Unmodified native screenshots are `release007-production-blocked.jpg`,
`release007-website-a.jpg` and `release007-website-b.jpg` in `.dart_tool/`.
The two owned fixture directories, public controls/build IDs and before/after
hash evidence remain ignored under `next-js/.tmp/release-*`. Only those fixture
servers were stopped. The validation installation was removed; its browser profile
and both pre-existing Git stashes were preserved.

### Remaining release gates

**007 remains Partial.** Restore the deployed Goal Hint application at the
retained HTTPS origin before repeating production launch, native production
offline/cache lifecycle and a representative real deployment update. Current
Windows package/installation success does not remove that production failure.
Actual keyboard, resizing, assistive technology, external handler/account-backend
and pinned launcher checks remain open
where the [acceptance matrix](dev-plan/007-platform-builds-and-release.md) says
Not tested.

The owner continues to defer Android device checks; none were resumed. Secured
Android signing and an actual signed install/run are still required. iOS/macOS
need an Apple host, Xcode, owner signing/provisioning and native acceptance;
macOS currently has ad-hoc signing without a qualified hardened-runtime/notarized
distribution setup. Linux is **Unsupported by the current app integration**
because no embedded browser adapter exists. Source targets, generated runners
and browser-only evidence do not qualify those releases. See
[release commands and host requirements](docs/releases.md),
[Windows packaging](docs/windows-release.md) and
[independent website-update reproduction](docs/website-update-acceptance.md).

## 007 Windows native account/offline isolation — 27 October 2026 (EAT)

All seven native privacy phases passed in separate Windows Debug processes,
retaining the ordinary development WebView profile. The dedicated secure
loopback origin `http://offline-identity.localhost:3196` keeps the real member
cookie name apart from normal `127.0.0.1`/`localhost` development hosts; changing
only a port would not isolate cookies. No hosts-file, DNS, certificate or browser
security override was used. The owned production-like website build was
`oiqyvIYhG58C1OcAUiIjZ` in ignored
`next-js/.tmp/offline-identity-eaee654d`.

The fixture reuses the actual shared offline worker/view/manifest, HttpOnly
cookie helpers, session verifier and login/sign-out HTTP handlers. Authentication
and persistence are isolated synthetic adapters with two accounts and a public
boolean/counter JSON state file; no real database, account, payment or message
service is changed. This is native engine/cookie/cache evidence, not deployed
production account-backend acceptance.

| Phase | Native PID | Build / test | Actual result |
| --- | --- | --- | --- |
| `seed-a` | 11760 | 66.5s / 11s | Anonymous cache ready; A's normal HttpOnly cookie and private HTML/RSC/JSON boundaries passed; every owned cache excluded private bytes |
| `cold-a` | 38472 | 57.8s / 4s | Server stopped; separate process and direct `/en` revisit loaded only public saved matches; private API and POST failed |
| `switch-b` | 14876 | 61.2s / 13s | After server restart A's persisted cookie verified; switched to B, A disappeared from the document, cache remained public and write-attempt counter was zero |
| `cold-b` | 8260 | 86.3s / 5s | Server stopped; separate process with retained B session exposed only public saved matches, with no private read/write success |
| `logout` | 7824 | 65.0s / 11s | B cookie persistence verified; actual sign-out cleared it, private API returned 401/no-store, original Clear-Site-Data header verified, anonymous cache prepared again |
| `cold-logout` | 36364 | 67.6s / 4s | Server stopped; another full native restart and `/en` revisit showed no prior identity, phone, prediction or token bytes |
| `cleanup` | 24820 | 86.0s / 8s | Cookie was already absent and write counter still zero before removing only the dedicated fixture worker and app caches |

All seven primary `.dart_tool/windows007-identity-<phase>.log` files end with All
tests passed. Native hosts and their owned browser children exited between
phases; the final development WebView process count was zero. Only verified
fixture server PIDs were stopped; port 3196 had no remaining listener. Other
hosts' profiles, cookies and caches were not cleared. The final synthetic state
had A/B inactive and writeAttempts zero. Public evidence is retained in ignored
`.dart_tool/windows007-identity-evidence.json`; its UTC timestamp
`2026-10-26T21:24:34Z` is 27 October in Africa/Kampala. Timings are functional-test
and build observations, not startup-performance measurements.

Initial harness attempts remain recorded: the original shared-host run was
stopped during compilation before a native app/login started. A React Flight
split-text assertion was corrected to check actual component type, private
prefix and identity value; unexpected browser JavaScript header visibility was
handled by verifying the original logout header through stateless raw HTTP with
no browser cookie copied. The recovery's actual sign-out completed, and the next
strict seed verified anonymous cookie state before login. Every privacy/cache
assertion remained; no production cache/auth implementation was weakened.

The [007 matrix](dev-plan/007-platform-builds-and-release.md) now marks Windows
logout/account isolation then offline reopen **Pass**, with the fixture scope
explicit. See [the complete reproduction and measured evidence](docs/offline-identity-acceptance.md).
The Windows appearance/input/accessibility row is left for the separate UI
qualification. Production `https://goalhint.com` still returns HTTP 403 /
Account Suspended, so a successful deployed-production account/cache lifecycle
is not claimed. Android device checks remain deferred; no Android action was
performed. Apple/Linux and signing/release limitations remain as recorded above.

## 007 Windows installer and taskbar identity — 27 October 2026 (EAT)

The installer now persists and reads back `System.AppUserModel.ID` on its managed
Desktop and Start Menu shortcuts through Shell `IPropertyStore`. Both links and
the native process use `com.goalhint.goal_hint`. The release guard suite now has
43 passing checks on both PowerShell 7 and Windows PowerShell 5.1, including
shortcut ID persistence and target/icon preservation. The installer leaves
Windows' own copied user pins and the system icon cache alone; see
[Windows install/update instructions](docs/windows-release.md).

All nine Windows ICO sizes now reuse the canonical small-size web artwork with
an opaque white football, navy panels and transparent outer tile. The Windows-only
viewport fits the unchanged mark to about 90% of its canvas instead of the old
67% mobile clear-space layout. Actual painted spans increased from 10 to 14 pixels
at 16px and from 170 to 232 at 256px; all four corners remain transparent, with
no clipped mark. `node tool/generate-icons.mjs --check` verifies all 45 outputs;
the other 44 platform raster files are byte-identical to their previous versions.
No Android device, ADB or Android build action was performed in this follow-up.

The normal production Release build for `0.1.0+4` passed in 56.6s. Package,
extraction verification and actual per-user installation passed. The local
unsigned archive is `build/releases/goal-hint-0.1.0+4-windows-x64.zip`,
13,445,863 bytes, SHA256
`007f2c2c4877c87e7a899581334e6f1ec373b77d4af9acce601a335616a83f6f`.
Its manifest accurately records source
`bfd3926c9b530cdc6eefa15775b7302b5305fe0e` with `dirty: true`; it is a local
validation candidate, not a published/signed release or an archive built from
the later documentation commit. The preceding +2/+3 validation installations
were removed through the bounded uninstaller, retaining the production profile.

The +4 Desktop icon and actual pinned taskbar icon were visually inspected at
the current Windows DPI. The task-created earlier pin was replaced using
Windows' own menu with the +4 shortcut. Its target, icon and AppUserModelID were
verified. Other user pins and global taskbar/icon settings were untouched.
The +4 installation and corrected pin remain available for the owner's requested
taskbar-size fix. Ignored evidence includes
`.dart_tool/windows007-taskbar-sized.jpg` and the sized release/package/install
logs. The original +1 archive/evidence above remain historical.

The production origin remains unchanged. The installed candidate still reaches
the provider's HTTP 403 / Account Suspended page; install/icon success does not
qualify online production launch. Android checks remain deferred, and the other
platform/signing gates are unchanged.

## 007 Windows manual UI follow-up — 27 October 2026 (EAT)

The [native UI guide](docs/windows-ui-acceptance.md) and Windows-only harness use
the actual shared brand/theme/form controls and real WebView2 adapter on the
dedicated `http://windows-ui.localhost:3195` origin. Planned operator stages cover
physical keyboard/Tab/Back, actual window resize and browser zoom, system-browser
handoff, a local file chooser with no upload, lifecycle and native accessibility.
File-only controls and the normal browser profile remain separate from the web
document; no native JavaScript bridge or production input/focus workaround was
added. Android device checks were not resumed.

| Attempt/check | Actual result and evidence boundary |
| --- | --- |
| Initial device-pointer attempt | Debug build 96.1s; native test failed at `theme-light` after 1m35s. Flutter's default test binding intercepted the actual mouse input for finder diagnostics. The harness was corrected to propagate hardware pointer events only inside the test, restoring the previous value in `finally` with a teardown fallback. This was a harness configuration failure, not a product theme defect |
| Corrected-pointer interruption | Debug build 65.8s; native PID 17752 reached `theme-light` but remained minimized from the retained 00:35:29 EAT checkpoint through the 00:48:27 observation. Native control repeatedly returned user-input-detected/minimized recovery errors. The owned test was stopped before any UI gate completed; normal development was restored before the later user-assisted run |
| Later shared-theme interaction | PID 38292, Debug build 72.7s. Real shared-toggle light and dark checks passed: CSS scheme, saved web preference, strict public metadata and all five native colors agreed. Both native caption appearances were visually inspected beside the web content |
| Preference restoration | Passed: final public evidence records initial `dark` and `themePreferenceRestored: true` under the dedicated fixture guard, without a document reload or OS appearance change |
| Human keyboard report and incidental Back | The owner reported text appears and Tab moves focus. The retained sequence had already reached `/native-details` before the keyboard acknowledgement; native Alt+Left returned home retaining `Goal Hint keyboard 007` and the same document time origin. The home remount resets event counters, so this is not a completed ordered keyboard/Back gate |
| Ordered keyboard gate | **Not tested to completion.** Tool typing/refocus observations were unreliable. The operator advanced only to trigger cleanup; the retained assertion expected `internal-link` but saw `acceptance-draft` at source line 104. The command ended exit 1 after 8m04s. This does not establish a product keyboard defect, and no production focus patch or synthetic JavaScript input was used |
| Later manual stages | **Not tested**: ordered route/Back, narrow/wide resize, browser zoom, actual external handler, file chooser, current-run lifecycle, native accessibility and screen-reader stages were not completed. No accessibility or screen-reader failure is inferred from unexecuted stages or static plugin inspection |

The test gate checks its ten-minute deadline only between live frame pumps;
a minimized native host can withhold a frame and delay deadline evaluation.
An optional browser observation can also wait while the engine is suspended.
This harness limitation explains why the interrupted stage remained pending;
a future frame-independent bound needs native validation without weakening its
assertions. Build/test/operator durations above are not launch-performance
measurements.

Ignored logs are `.dart_tool/windows007-ui-native.log` (finder interception),
`windows007-ui-native-final.log` (minimized interruption) and
`windows007-ui-native-resumed.log` (partial later run). Public records are
`.dart_tool/windows007-ui-blocked.json`,
`.dart_tool/windows007-ui-human-evidence.json` and
`next-js/.tmp/windows-ui-7135a484/windows-ui-control-evidence.json`; the retained
dark-caption screenshot is `.dart_tool/windows007-ui-dark.jpg`. These records
preserve distinct attempts instead of claiming one complete UI pass. The
[007 matrix](dev-plan/007-platform-builds-and-release.md) remains authoritative
for the grouped Windows rows and subsequent cleanup.

The Windows appearance/input/accessibility and navigation/external/account
scenarios remain incomplete despite the measured theme subset, separate
seven-phase account/offline passes and installed taskbar identity evidence above.
The retained production origin still returns HTTP 403 / Account Suspended;
actual deployed-production account/cache lifecycle and successful Release launch
remain unqualified. Android device checks remain deferred, and Apple/Linux and
signing gates are unchanged. Overall 007 stays **Partial**.

### Final Windows cleanup and source checks

The normal `lib/main.dart` Windows Debug build for development origin
`http://127.0.0.1:3000` passed again in 33.4s after the final UI attempt.
The UI host and its development WebView children exited, and owned fixture
ports 3195/3196 had no listener. The normal website server and the owner's
opened installed +4 application were preserved. Explorer was returned to its
original This PC location. No Narrator or Windows appearance setting was changed.

Final Dart analysis of `lib`, `test` and `integration_test` was clean; all 42
unit/widget tests passed. Formatting checked 34 Dart files with no changes.
Both Python fixture helpers parsed, generated asset verification passed for all
45 outputs, and Git whitespace checks passed. These static/unit results do not
override the explicitly failed/incomplete native UI attempt above. The seven
native privacy phases remain separately qualified. Generated profiles, builds,
archives, controls, screenshots and logs remain ignored; no private configuration
or credentials are included in the source change.

## 008 - Explicit local Windows development — 27 October 2026

**Completed.**

The reported Account Suspended window belonged to the installed production
`0.1.0+4` application. The existing source resolver already selected development
at `http://localhost:3000` for Debug and retained `https://goalhint.com` for
Profile/Release. No URL-selection, production installation or hosting
configuration change was needed.

Added `tool/windows/run-dev.ps1` and the repository's VS Code **Goal Hint Windows
(local development)** launch configuration. Both explicitly run the normal
`lib/main.dart` entry point in Debug with `APP_ENV=development` and
`DEV_APP_ORIGIN=http://localhost:3000`. The PowerShell launcher accepts `-Port`
for another local server and runs from the Flutter project regardless of the
calling directory. Development instructions distinguish this run from the
installed production shortcut. [Plan 008](dev-plan/008-local-windows-development.md)
records the scope.

| Check | Actual result |
| --- | --- |
| Shared origin helper | Resolved development, `http://localhost:3000` |
| `flutter analyze` | Passed, no issues; 257.1s |
| Configuration and startup widget tests | All 14 passed, including the normal compiled Debug entry point, unchanged production defaults and release/profile development rejection |
| Launcher PowerShell parse, VS Code launch JSON and Dart formatting | Passed; formatting changed no files |
| Local Next.js server | Existing `http://localhost:3000/en` returned HTTP 200 and Goal Hint content; no duplicate server started |
| Native development run | New launcher built the Windows Debug app in 203.0s and started workspace PID 37340 |
| Actual native screen | Computer Use selected Debug window 52101868/PID 37340, verified the workspace executable path and visibly rendered the local Best Slips application with dark header/navigation/content and a development Rendering indicator; the hosting suspension page was absent |

The development app remains running. Its consent prompt was left untouched;
no authentication or privacy action was performed. The development run preserves
the installed release. Its hosting suspension and
the prior platform/release qualification limits remain unchanged. Generated
builds, logs and browser profiles remain ignored.

## 009 — Shared-slip app links — 29 October 2026

**Partial: source integration and automated checks complete; signed device and
domain verification remain external setup.**

The existing WebView now opens a validated shared-slip URL on cold launch and
later native route notifications. Warm and repeated links preserve the same
browser and account session; a link delivered during initialization uses the
latest pending target. Only the configured origin and `/s/<32 lowercase hex>`
are accepted. Unknown hosts, credentials, encoded paths, malformed tokens,
queries, fragments, and unrelated native routes are ignored. Native startup
always generates one root page while its WebView owns the shared web route.

Android declares `autoVerify` for HTTPS `goalhint.com/s/`. iOS includes
`applinks:goalhint.com` in the Runner entitlement for all three build variants,
with built-in Flutter deep linking enabled. Public association JSON is served by
the web app and uses optional, validated release-certificate and Apple-team
settings. No native package dependency or package-lock change was needed.

| Check | Actual result |
| --- | --- |
| Final targeted Dart analysis | Passed: five changed Dart files, no issues, 22.2s |
| Full Flutter test suite | All 51 passed, including eight new native-link and platform configuration checks |
| Web association/configuration tests | All five passed |
| Targeted web ESLint | Passed with zero warnings |
| iOS plist/entitlement XML and Git whitespace | Passed |
| Signed native builds, deployed domain associations, Android/iOS device verification | Not performed; actual release fingerprint, Apple team, live deployment and signed installs are required |

The initial full analyzer run found one unused test import; it was removed
before final targeted analysis. Native tests also caught and verified the fix
for Flutter's initial-route override, preventing a cold-link native navigation
error. These checks do not qualify a signed app or domain association.
See [plan 009](dev-plan/009-shared-slip-app-links.md) and
[app-link setup](../next-js/docs/slip-app-links.md). The website remains the
fallback while association configuration is blank or unverified.
