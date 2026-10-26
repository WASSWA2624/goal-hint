# Flutter development tracker

**Current implementation: native foundation and central URL configuration.**
The project includes Android, iOS, Windows, macOS, and Linux runners, validated
development/production origin selection, native network policy, and a safe
startup error. Website loading, offline behavior, and release branding remain
in steps 003–007. Use [the plan index](dev-plan/000-index.md) for dependencies.

| Step | Feature | Status |
| --- | --- | --- |
| [001](dev-plan/001-foundation-and-platform-support.md) | Foundation and platform support | Completed — foundation and available Windows runtime verified |
| [002](dev-plan/002-environment-urls.md) | Development and production URLs | Partial — configuration/build/reachability verified; installed WebView loading awaits 003 |
| [003](dev-plan/003-web-app-integration.md) | Embedded web app integration | Not started |
| [004](dev-plan/004-persistent-offline-startup.md) | Persistent offline startup | Not started |
| [005](dev-plan/005-reconnection-and-cache-updates.md) | Reachability and safe updates | Not started |
| [006](dev-plan/006-app-identity-and-theme.md) | Installed identity and appearance | Not started |
| [007](dev-plan/007-platform-builds-and-release.md) | Platform builds and release acceptance | Not started |

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
No phone app installation, USB reverse mapping, or firewall changes were needed.
Logs, probe output, APKs, executables, and other generated evidence remain in
ignored `.dart_tool/`, `build/`, and web output directories.

### Acceptance still requiring 003

Configuration implementation, available Release builds, and desktop/physical
Android HTTP reachability are verified. **002 remains Partial** because the
installed Flutter shell has not loaded the website: that acceptance depends on
the native WebView adapter implemented in 003. HTTP/socket checks do not verify
WebView cleartext policy, cookies, navigation, native local-network prompts, or
installed-app lifecycle behavior. Reuse this resolver directly in the adapter.

Apple native builds, signed-plist inspection, and physical Apple network/privacy
checks require macOS/Xcode and Apple hardware. Linux native execution remains
untested on this Windows host. Verify those targets during their adapter/build
work; the source-policy tests do not qualify their native runtime behavior.
Offline startup and reconnection remain 004–005; identity and distribution
remain 006–007. No WebView or offline package was introduced by this step.
