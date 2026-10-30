# Goal Hint Flutter shell

The native project lives entirely in this directory. It has Android, iOS,
Windows, macOS, and Linux runners. `GoalHintApp` embeds the shared website through
platform browser adapters on Android, iOS, macOS, and Windows; Linux embedding
remains an explicit integration gap.
The Next.js app owns the product screens, authentication, data, and business logic.

Native document failures use a bundled recovery page with the configured logo,
app name, active theme, a retry action and relevant connection guidance. Engine
addresses and technical error descriptions are hidden, including during retry.
The same browser/profile and intended page are retained. See
[branded recovery](dev-plan/011-branded-native-recovery.md) for behavior and checks.

`AppBranding` centralizes native feedback identity. Its default name and fallback
colors come from the website's canonical brand tokens through
`node flutter/tool/generate-icons.mjs` (use `--check` to verify synchronization).
Use `--dart-define=APP_DISPLAY_NAME=...` to override the feedback name, or supply
`branding` when embedding `GoalHintApp`. The logo reference is configured once
and points to a bundled asset, so branding also works offline. Native bundle/app
IDs and installed launcher names retain their platform configuration. Shipping
this host change requires rebuilt native apps; a website update alone is insufficient.

Android pull-to-refresh is implemented in the native host: pull down from the top
of the document and release to reload the current page. Normal scrolling,
horizontal gestures, multi-touch and keyboard input retain their web behavior.
The existing browser and cookies remain intact. Installing a rebuilt Android
binary is required; a shared-website update alone cannot add this native feature.
See [implementation and verification](dev-plan/010-android-pull-to-refresh.md).

Shared slip HTTPS links can target the existing browser on cold launch or while
the app is running. Android and iOS app-link declarations are included, but
opening an installed app also requires deployed domain associations and rebuilt
signed apps. Configure the actual signing fingerprint and Apple team as described
in [shared-slip app links](../next-js/docs/slip-app-links.md); the website remains
the fallback. No current device/domain verification is implied by source setup.

For local Windows development, start `npm run dev` in `next-js/`, then run
`& .\tool\windows\run-dev.ps1` from `flutter/`. The development launcher opens
`http://localhost:3000` in a Debug host; the installed Goal Hint shortcut continues
to use the production website. See [development URLs](docs/development-urls.md).

Android development can install and debug over Wi-Fi without a USB cable; follow
[wireless setup and target selection](docs/development-urls.md#android-wireless-development).

Follow [the local development plan](dev-plan/000-index.md) and
[execution tracker](dev-tracker.md). Central URL configuration from step 002 is
implemented. Step 003 adds native WebView integration; consult the tracker for
the targets and account behaviors actually verified.
Step 004 adds a bounded anonymous offline view through the shared web cache;
see [offline setup and limits](docs/offline-startup.md). Step 005 adds bounded
shared retries and safe cache updates, with Windows/browser acceptance recorded
in the tracker. Step 006 adds shared-web appearance metadata, native feedback
and system-bar styling, desktop caption integration, reusable launcher artwork,
and white branded startup. Windows real OS light/dark, web preference,
reload and separate-process restart checks passed. See
[native identity](docs/app-identity.md) and the tracker for exact evidence.
Android checks remain deferred; Apple/Linux execution and installed launcher
qualification remain open, keeping 006 Partial. Step 007 adds a pinned release
toolchain, Windows bundle/install tooling and explicit Android release-signing
gates. See [builds and release acceptance](docs/releases.md),
[Windows packaging](docs/windows-release.md) and [Android signing](docs/android-release.md).
All distributable archives belong in the root [`deploy/`](../deploy/README.md)
folder; `build/` contains ignored compiler intermediates only. The initial public
version is **1.0.0**, with Flutter build number **5**. Use
`python tool/package_release.py android` for the signed APK ZIP, the Windows
packager for its setup EXE ZIP, and the Apple commands in
[the release guide](docs/releases.md) on a macOS signing host. Linux is excluded
from this initial set of delivery packages. For the current development builds,
use `python tool/package_development.py android --origin http://192.168.1.148:3000`
or replace `android` with `windows` on the Windows host. These produce clearly
labelled `1.0.0-dev.zip` packages that use the development web server; production
signing gates remain unchanged. See [development packaging](docs/releases.md#development-delivery-packages).
The configured production hosting currently returns an Account Suspended page;
production launch and publication remain blocked. No release is claimed merely
because an artifact compiles.

Windows follow-up acceptance is reproducible through the
[offline account-isolation guide](docs/offline-identity-acceptance.md) and
[native UI guide](docs/windows-ui-acceptance.md). They separate real WebView
cookie/cache and operator input/window/handler evidence from synthetic account
storage and unavailable production services. The tracker records actual passes,
interrupted attempts and remaining checks; a harness or successful build alone
does not qualify a Windows release. Android device checks remain deferred.

## Toolchain and setup

The verified foundation baseline is **Flutter 3.44.6 stable / Dart 3.12.2**.
Use that SDK on PATH to reproduce the recorded checks. It is the installed
baseline, not a claim to be the newest Flutter release. See
[Flutter installation](https://docs.flutter.dev/install) for SDK setup.

`pubspec.yaml` declares the SDK minimums; `.metadata` records the generator
revision, `release-toolchain.json` pins the release SDK, and `pubspec.lock`
records package resolution. Keep the lockfile in Git.
System-WebView, WebView2, external URL launching, and profile-path dependencies
are pinned with the lockfile. The Windows plugin includes a small native policy
patch in `packages/`; see [integration details](docs/web-app-integration.md).

From the repository root, enter `flutter/`, then run:

```sh
flutter --version
flutter doctor -v
flutter pub get
dart format --output=none --set-exit-if-changed lib test tool integration_test
flutter analyze
flutter test
```

The tests cover environment selection, origin validation, native policy, and
compact/desktop startup layouts with normal and 200% system text scaling.
Actual native build/run results are recorded separately
in the tracker; a widget test or generated runner does not qualify another target.

## Web origin configuration

Debug builds default to development: Android uses `http://10.0.2.2:3000`
for the standard emulator; other targets use `http://localhost:3000`.
For a physical phone, supply the development computer's reachable LAN origin:

```sh
flutter run --dart-define=APP_ENV=development --dart-define=DEV_APP_ORIGIN=http://192.168.1.148:3000
```

Replace that example IP with the server's current address. Profile and Release
default to the fixed production origin, `https://goalhint.com`. They reject
development configuration, and production rejects any `DEV_APP_ORIGIN` define.
Invalid configuration shows a useful startup error without echoing its input.
No credentials or Next.js environment files belong in these public defines.

See [development URLs](docs/development-urls.md) for emulator/device routing,
server binding, native transport policy, and configuration inspection commands.
The selected origin is loaded by the native browser. Product routes, forms,
authentication, and appearance continue to come from the website.

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

If Kotlin reports `this and base files have different roots` while closing
incremental caches, the Pub cache and project are on different Windows drives.
Disable that optimization for this build process, without changing global
settings or deleting either cache:

```powershell
$env:JAVA_TOOL_OPTIONS = ("$env:JAVA_TOOL_OPTIONS -Dorg.gradle.project.kotlin.incremental=false").Trim()
flutter build apk --debug
```

Normal builds should regenerate their tooling after integration tests rather
than reuse a stale test registrant with `--no-pub`.

The Windows browser plugin uses C++20 with current MSVC. Its locally documented
compatibility fixes retain standard compiler checks; NuGet must be available on
the build process's PATH. Initial native plugin compilation can take longer than
later builds that reuse its objects.

## Platform integration and offline boundary

The [support matrix](docs/platform-support.md) links primary evidence for build
hosts, released WebView candidates, cookies/profiles, asset loading, and
service-worker limitations. It distinguishes source documentation from the
current integration's actual checks and leaves Linux embedding unproven.

The official system-WebView adapter serves Android/iOS/macOS, and the Windows
adapter uses WebView2 with an app-owned persistent profile. Windows build hosts
need NuGet on PATH; installed machines need WebView2 Runtime. Apple execution
still requires its native host. Linux needs a real engine prototype before its
runner can qualify as an embedded shell. Browser storage does not by itself
supply cross-platform offline startup. The implemented
[shared offline cache](docs/offline-startup.md) has separate secure-origin and
platform acceptance requirements.

Shared cache eligibility and updates belong in
[Next.js plan 069](../next-js/dev-plan/069-offline-shell-support.md), with minimal
native support only for demonstrated platform gaps. Keep interface styling and
business logic in the web app. Shared requirements remain in
[the shell prompt](../prompts/flutter-app-shell.md) and
[the app write-up](../app-write-up.md).
