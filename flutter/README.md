# Goal Hint Flutter foundation

The native project lives entirely in this directory. It has Android, iOS,
Windows, macOS, and Linux runners and a minimal `GoalHintApp` startup screen.
The Next.js app owns the product screens, authentication, data, and business logic.

Follow [the local development plan](dev-plan/000-index.md) and
[execution tracker](dev-tracker.md). URL configuration is step 002, WebView
integration is 003, persistent offline startup and safe updates are 004–005,
native branding is 006, and release packaging is 007. Generated launcher artwork
and bundle identifiers remain provisional until the identity step.

## Toolchain and setup

The verified foundation baseline is **Flutter 3.44.6 stable / Dart 3.12.2**.
Use that SDK on PATH to reproduce the recorded checks. It is the installed
baseline, not a claim to be the newest Flutter release. See
[Flutter installation](https://docs.flutter.dev/install) for SDK setup.

`pubspec.yaml` declares the SDK minimums; `.metadata` records the generator
revision and `pubspec.lock` records package resolution. Keep the lockfile in Git.
The only runtime dependency is the Flutter SDK. WebView dependencies will be
selected and pinned in step 003 after the platform prototypes.

From the repository root, enter `flutter/`, then run:

```sh
flutter --version
flutter doctor -v
flutter pub get
dart format --output=none --set-exit-if-changed lib test
flutter analyze
flutter test
```

The widget tests exercise compact and desktop startup layouts with normal and
200% system text scaling. Actual native build/run results are recorded separately
in the tracker; a widget test or generated runner does not qualify another target.

## Native development

| Target | Build command from `flutter/` | Build host |
| --- | --- | --- |
| Windows | `flutter build windows --debug` | Windows with Visual Studio C++ desktop tools and Windows SDK |
| Android | `flutter build apk --debug` | Windows/macOS/Linux with compatible JDK and Android SDK/NDK |
| iOS simulator | `flutter build ios --simulator --debug` | macOS with Xcode and simulator runtime |
| macOS | `flutter build macos --debug` | macOS with Xcode tools |
| Linux | `flutter build linux --debug` | Linux with Clang, CMake, Ninja, pkg-config, and GTK development libraries |

Use `flutter devices`, then `flutter run -d <device-id>` for an available target;
for this Windows host, use `flutter run -d windows`. These are development builds.
Store signing materials, SDK locations, local build caches, and output outside Git.

This host has Visual Studio Community 2026, the C++ workload, Windows SDK
10.0.26100.0, and Android API 36/NDK 28.2.13676358. Its inherited `JAVA_HOME` points
to a missing JDK, while Microsoft JDK 17 is on PATH. A Windows PowerShell build
can select the installed JDK for that session:

```powershell
$javaExecutable = (Get-Command java -ErrorAction Stop).Source
$env:JAVA_HOME = Split-Path (Split-Path $javaExecutable -Parent) -Parent
flutter build apk --debug
```

Flutter doctor also flags spaces in the Android SDK path as an NDK tooling risk.
See the tracker for the observed Android result and any process-local workaround;
these findings are host configuration constraints, not unsupported Flutter targets.
Apple and Linux native builds require their corresponding hosts.

If a Windows Java/Gradle invocation reports `Unable to establish loopback
connection` through `UnixDomainSockets.connect0`, this host's selector probe works
with an explicit project-local temporary directory. In the same PowerShell
session as the JDK selection above:

```powershell
$buildTemp = Join-Path (Get-Location).Path '.dart_tool/jtmp'
New-Item -ItemType Directory -Force -Path $buildTemp | Out-Null
$env:TEMP = $buildTemp
$env:TMP = $buildTemp
$tempOption = '-Djava.io.tmpdir="' + $buildTemp + '"'
$env:JAVA_TOOL_OPTIONS = ("$env:JAVA_TOOL_OPTIONS $tempOption").Trim()
flutter build apk --debug
```

These settings last for that shell session. Keep the temporary directory under
the ignored `.dart_tool/` directory and consult the tracker for the build outcome.

## Platform integration and offline boundary

The [support matrix](docs/platform-support.md) links primary evidence for build
hosts, released WebView candidates, cookies/profiles, asset loading, and
service-worker limitations. It distinguishes the selected local SDK from the
newer online documentation and explicitly leaves Linux embedding unproven.

Prefer the official system-WebView plugin for Android/iOS/macOS, a verified
WebView2 adapter for Windows, and a Linux engine prototype before relying on that
platform. The matrix is a decision record, not an implemented WebView or offline
feature. Do not assume that one package or a persistent browser profile supplies
cross-platform offline startup.

Shared cache eligibility and updates belong in
[Next.js plan 069](../next-js/dev-plan/069-offline-shell-support.md), with minimal
native support only for demonstrated platform gaps. Keep interface styling and
business logic in the web app. Shared requirements remain in
[the shell prompt](../prompts/flutter-app-shell.md) and
[the app write-up](../app-write-up.md).
