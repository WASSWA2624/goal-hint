# Platform builds and release acceptance

Run the commands below from `flutter/`. A successful compilation, an installed
validation build, and a published release are separate results. The current
acceptance record is [plan 007](../dev-plan/007-platform-builds-and-release.md)
and the [tracker](../dev-tracker.md). No store submission is performed by these
commands.

## Development delivery packages

The current deliverables are development versions, named
`deploy/goal-hint-android-1.0.0-dev.zip` and
`deploy/goal-hint-windows-1.0.0-dev.zip`. From `flutter/`, build/package with:

```sh
python tool/package_development.py android --origin http://192.168.1.148:3000
python tool/package_development.py windows --origin http://192.168.1.148:3000
```

Use the development computer's current reachable LAN origin. Keep Next.js
running with `npm --prefix next-js run dev` from the repository root. Android
uses the standard Android Debug signing key; Windows creates an unsigned setup
EXE with a separate `Goal Hint Development` per-user installation and shortcuts.
Windows Debug builds require the Visual Studio C++ Debug runtime already on the
developer's computer; those non-redistributable CRT DLLs are excluded from ZIPs.
WebView2 Runtime is also required. These packages are for development machines.

`--skip-build` packages only the immediately completed same-checkout Debug build.
Android verifies the supplied URL in the APK's compiled kernel; Windows checks
the normal entry point and requested development defines in generated CMake
configuration. Both check identity/version and include a development manifest
and brief instructions. They are not production provenance attestations.
Use `--force` only to replace an existing development ZIP explicitly.

iOS/macOS development packages remain pending a macOS/Xcode host. On that host,
use the normal debug commands with `APP_ENV=development` and the reachable origin:
`flutter build ipa --debug --export-method development --target=lib/main.dart --dart-define=APP_ENV=development --dart-define=DEV_APP_ORIGIN=<origin>`
for a properly provisioned development IPA, or
`flutter build macos --debug --target=lib/main.dart --dart-define=APP_ENV=development --dart-define=DEV_APP_ORIGIN=<origin>`.
Export through the owner's Apple development provisioning and place the resulting
verified development packages only under root `deploy/`, using the same
`goal-hint-ios-1.0.0-dev.zip` / `goal-hint-macos-1.0.0-dev.zip` naming. No Apple
archive is created by the Windows host, and Linux remains excluded.

## Production delivery packages

The root [`deploy/`](../../deploy/README.md) folder is the only delivery
location. Initial packages keep public version **1.0.0**; `pubspec.yaml` is
`1.0.0+1`. The internal build number stays distinct from the public ZIP filename.
Do not increment the public version until the first production release.
Compiler caches/intermediates remain ignored under `flutter/build/`; they are
not additional release locations. Linux is excluded from these initial packages.

| Target | Command from `flutter/` | Root deployment ZIP |
| --- | --- | --- |
| Android | `python tool/package_release.py android` | `deploy/goal-hint-android-1.0.0.zip` containing the signed universal APK |
| Windows | `./tool/windows/package.ps1 -RedistDirectory <installed-x64-CRT-directory>` | `deploy/goal-hint-windows-1.0.0.zip` containing the installable setup EXE |
| iOS | `python tool/package_release.py ios --export-options /private/ExportOptions.plist` | `deploy/goal-hint-ios-1.0.0.zip` containing the distribution-signed IPA |
| macOS | `python tool/package_release.py macos --dmg ../deploy/.staging/macos/goal-hint.dmg` | `deploy/goal-hint-macos-1.0.0.zip` containing the signed/notarized DMG |

The Android and iOS commands run a fresh production build before verification.
The macOS command validates and wraps an owner-prepared production DMG; it does
not build or sign that DMG. Each command refuses missing prerequisites instead
of publishing placeholders, and writes a ZIP SHA256 sidecar. Repeat an unpublished
version only with explicit `--force` (Python) or `-Force` (PowerShell). Temporary
delivery work uses root `deploy/.staging/`, not an application release directory.

For iOS, configure the existing Apple team, bundle identifier
`com.goalhint.goalHint`, distribution certificate and provisioning in Xcode on
macOS. Export the real `ExportOptions.plist` for the intended App Store/TestFlight,
ad-hoc or enterprise channel and keep it outside Git. The packager rejects
development exports and unsigned/ad-hoc-signed app binaries, and checks the
application ID and `1.0.0` / `1` version. An IPA installs only through the Apple
channel authorized by its provisioning; it is not a universal sideload installer.

For macOS, first build the normal production entry point on the pinned macOS
toolchain:

```sh
flutter build macos --release --target=lib/main.dart --dart-define=APP_ENV=production
```

Use the owner's existing Developer ID Application identity and Xcode distribution
workflow to sign the resulting `Goal Hint.app`, including embedded frameworks,
with hardened runtime, timestamping and the app's release entitlements. Preserve
the configured bundle identifier and its outbound-network entitlement. Signing
and Apple credentials must be supplied by the release owner; a local ad-hoc
signature is insufficient. Do not change the pinned SDK or deployment targets
implicitly. After signing the production app, prepare its install image:

```sh
mkdir -p ../deploy/.staging/macos/image
ditto "build/macos/Build/Products/Release/Goal Hint.app" "../deploy/.staging/macos/image/Goal Hint.app"
ln -s /Applications ../deploy/.staging/macos/image/Applications
hdiutil create -volname "Goal Hint" -srcfolder ../deploy/.staging/macos/image -format UDZO ../deploy/.staging/macos/goal-hint.dmg
# Replace the public signing identity/profile names with the owner's configured ones.
codesign --sign "Developer ID Application: YOUR REGISTERED IDENTITY" --timestamp ../deploy/.staging/macos/goal-hint.dmg
xcrun notarytool submit ../deploy/.staging/macos/goal-hint.dmg --keychain-profile goal-hint-notary --wait
xcrun stapler staple ../deploy/.staging/macos/goal-hint.dmg
python tool/package_release.py macos --dmg ../deploy/.staging/macos/goal-hint.dmg
```

The packaging command verifies the DMG, stapled notarization ticket, Gatekeeper
acceptance, contained app's distribution signature/identity/version and absence
of debug snapshots. The owner must attest that this DMG contains the just-built
production app; signature and version checks alone cannot prove its source
revision or Dart defines. Complete actual installed acceptance before distribution.
Apple packaging was not executed on this Windows host.

Primary workflow references checked 27 October 2026:
[Flutter iOS deployment](https://docs.flutter.dev/deployment/ios),
[Flutter macOS deployment](https://docs.flutter.dev/deployment/macos), and
[Apple notarization](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution).

## Reproducible configuration

[release-toolchain.json](../release-toolchain.json) pins Flutter **3.44.6**,
framework revision `ee80f08bbf97172ec030b8751ceab557177a34a6`, and Dart **3.12.2**.
Use that SDK and the committed `pubspec.lock`; `flutter pub get` restores the
locked dependencies. The SDK constraints in `pubspec.yaml` are compatibility
minimums, not an exact SDK selection. The Windows packager verifies the pinned
SDK before packaging. Do not upgrade SDKs or plugins implicitly while reproducing
a release.

```sh
flutter --version
flutter doctor -v
flutter pub get
dart format --output=none --set-exit-if-changed lib test integration_test
flutter analyze
flutter test
```

Build the normal `lib/main.dart` entry point after integration tests. Profile and
Release builds use only `https://goalhint.com`; explicitly pass
`--dart-define=APP_ENV=production`. A development origin is rejected in these
modes. Dart defines contain public configuration, never credentials. See
[URL selection](development-urls.md) and [identity/signing boundaries](app-identity.md).

The production HTTPS probe on 26 October 2026 followed a same-origin redirect
to `/cgi-sys/suspendedpage.cgi` and returned **HTTP 403**, title **Account
Suspended**, without Goal Hint appearance metadata. The owner chose to retain
this origin. Production online launch and a real production website update
remain blocked until the hosting service serves the application again; no
alternate Release URL, certificate exception, DNS override or cached fixture
is used to disguise that failure.

## Build hosts and deployment scope

| Target | Required build environment | Project configuration and current qualification |
| --- | --- | --- |
| Android | Windows, macOS or Linux with the pinned Flutter SDK, compatible JDK, Android SDK/NDK and Gradle dependencies | This host has Microsoft JDK 17.0.20.8, Android API/build-tools 36/36.0.0 and NDK 28.2.13676358. The SDK template selects min API 24 and compile/target API 36. Physical-device checks remain deferred. See [Android signing/builds](android-release.md). |
| Windows | Windows with Visual Studio C++ desktop workload, CMake, Windows SDK and NuGet | Actual host: Windows 11 25H2 x64, OS 10.0.26200.9711; Visual Studio Community 2026 18.6.0, Windows SDK 10.0.26100.0. x64 is the local build/validation target. Target machines require WebView2 Runtime and the C++ runtime. See [Windows packaging/install](windows-release.md). |
| iOS | macOS with Xcode, matching device/simulator runtimes and Apple signing/provisioning for device distribution | Runner source sets iOS 13.0; no Apple host or configured developer team was verified here. WKWebView and offline startup require actual device qualification. |
| macOS | macOS with Xcode/command-line tools and Apple signing/notarization for distribution | Runner source sets macOS 10.15 and ad-hoc signing; no developer team or hardened-runtime distribution configuration is qualified. The sandbox permits outbound client networking. No Apple compilation/runtime is qualified. |
| Linux | Linux with Clang, CMake, Ninja, pkg-config, GTK 3/C++ development libraries and the selected browser engine's dependencies | The current application has no Linux embedded browser adapter. A built runner's explicit unavailable-browser screen does not satisfy the app requirement; shell use is **Unsupported** until that integration is implemented and tested. |

These are actual project settings and host findings, not a claim that every OS
at a template minimum works with every plugin or distribution channel. Current
online Flutter documentation describes a newer SDK; its iOS/macOS minimums must
not silently replace the pinned SDK's source targets. The
[platform support audit](platform-support.md) distinguishes SDK guidance from
application evidence. No Arm64 desktop qualification is inferred from x64.

## Native artifacts and install/run

| Target | Build command | Output and installation boundary |
| --- | --- | --- |
| Android development | `flutter build apk --debug --target=lib/main.dart --dart-define=APP_ENV=development --dart-define=DEV_APP_ORIGIN=http://192.168.1.148:3000` | `build/app/outputs/flutter-apk/app-debug.apk`. Replace the example LAN address; install with `flutter install --debug -d <device-id>` only when device checks are resumed. Standard emulator origin is `http://10.0.2.2:3000`. |
| Android production | `flutter build appbundle --release --target=lib/main.dart --dart-define=APP_ENV=production` | `build/app/outputs/bundle/release/app-release.aab` for store upload; `flutter build apk --release --target=lib/main.dart --dart-define=APP_ENV=production` produces `build/app/outputs/flutter-apk/app-release.apk`. Both require secured release signing. An AAB is not directly installable. |
| Windows production | `flutter build windows --release --target=lib/main.dart --dart-define=APP_ENV=production` | `build/windows/x64/runner/Release/`; distribute the complete validated bundle, not just its executable. [The packager](windows-release.md) adds app-local CRT files, integrity/provenance records and per-user install tooling. |
| iOS simulator development | `flutter build ios --simulator --debug --target=lib/main.dart --dart-define=APP_ENV=development --dart-define=DEV_APP_ORIGIN=http://localhost:3000` | `build/ios/iphonesimulator/Runner.app`; install on a booted simulator using Xcode or `xcrun simctl install booted build/ios/iphonesimulator/Runner.app`. Simulator execution does not qualify a physical iPhone. |
| iOS production | `flutter build ipa --release --target=lib/main.dart --dart-define=APP_ENV=production` | Archive under `build/ios/archive/`, IPA under `build/ios/ipa/`; select the owner’s actual team, bundle ID and secured export/provisioning configuration in Xcode. Use Xcode/Transporter for the authorized distribution channel. No signing identity was invented here. |
| macOS development | `flutter run -d macos --debug --target=lib/main.dart --dart-define=APP_ENV=development --dart-define=DEV_APP_ORIGIN=http://localhost:3000` | Native development app; no external distribution claim. |
| macOS production | `flutter build macos --release --target=lib/main.dart --dart-define=APP_ENV=production` | `build/macos/Build/Products/Release/Goal Hint.app`; verify the actual generated product name on the Apple host, then sign, notarize and staple using the owner’s secured Developer ID workflow before external distribution. |
| Linux | `flutter build linux --release --target=lib/main.dart --dart-define=APP_ENV=production` | Typically `build/linux/x64/release/bundle/` on an x64 host. This is a future runner-build command, **not a usable web-shell release** while embedding is missing. Distribute the whole bundle only after that gap and its system-library requirements are qualified. |

Use `flutter devices` and an explicit target for development. See
[wireless Android setup](development-urls.md#android-wireless-development) for
cable-free deployment when device work resumes. This host's JDK/temp/Kotlin
workarounds are process-local and documented in the [Flutter README](../README.md).
Do not relocate SDKs, modify global settings or erase another profile as a build
workaround.

Keep private key files, passwords, Apple certificates/profiles, notarization
credentials, SDK paths, manifests/logs with local paths and generated native
artifacts outside Git. Public identifiers and icon sources remain versioned.
Use existing identities for upgrades; replacing an Android signing certificate
or changing an application ID can prevent installation over an existing build.

## Website-only updates and acceptance

Ordinary interface and business changes are delivered by Next.js at the same
configured origin. Navigation/reload obtains the deployed document; the shared
offline worker validates compatible anonymous bundles and preserves the previous
working copy when an update fails. It does not silently replace an active form.
Native origin/policy, plugin, icon, identifier, entitlement or native code changes
require new native artifacts and their applicable signing.

The [independent A/B website fixture](website-update-acceptance.md) verifies this
delivery boundary locally without publishing a production change. It qualifies
the development host and actual WebView, not the suspended production deployment.
The [integration guide](../integration_test/README.md) preserves earlier native
offline, navigation, session and appearance acceptance. Keep fixture/browser
results, Debug-native results, and installed production Release results separate
in 007's matrix. A missing host is **Not tested**; the missing Linux adapter is
**Unsupported**; an exercised failed production launch is **Fail**.

Primary deployment references, checked 26 October 2026:
[Flutter Windows deployment](https://docs.flutter.dev/deployment/windows),
[Windows bundle requirements](https://docs.flutter.dev/platform-integration/windows/building),
[WebView2 distribution](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution),
[Flutter Android deployment](https://docs.flutter.dev/deployment/android),
[Flutter iOS deployment](https://docs.flutter.dev/deployment/ios),
[Flutter macOS deployment](https://docs.flutter.dev/deployment/macos), and
[Flutter Linux deployment](https://docs.flutter.dev/deployment/linux).
