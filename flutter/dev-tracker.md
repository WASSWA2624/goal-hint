# Flutter development tracker

**Current implementation: native foundation generated.** The project includes
Android, iOS, Windows, macOS, and Linux runners and a minimal startup screen.
Website loading, URL configuration, offline behavior, and release branding remain
in steps 002–007. Use [the plan index](dev-plan/000-index.md) for dependencies.

| Step | Feature | Status |
| --- | --- | --- |
| [001](dev-plan/001-foundation-and-platform-support.md) | Foundation and platform support | Completed — foundation and available Windows runtime verified |
| [002](dev-plan/002-environment-urls.md) | Development and production URLs | Not started |
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
