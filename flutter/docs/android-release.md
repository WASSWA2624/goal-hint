# Android build and signing

Commands run from `flutter/`. Use the pinned Flutter **3.44.6 stable / Dart
3.12.2** toolchain and the committed `pubspec.lock`. The installed baseline uses
Android Gradle Plugin **9.0.1**, Gradle **9.1.0**, JDK **17**, compile/target SDK
**36**, minimum SDK **24**, and NDK **28.2.13676358**. These are source/toolchain
settings, not a claim that every API level or CPU has passed device acceptance.
See [the release plan](../dev-plan/007-platform-builds-and-release.md) and
[tracker](../dev-tracker.md) for actual results.

## Build modes and public configuration

The Android application ID remains `com.goalhint.goal_hint`, its display name is
Goal Hint, and `pubspec.yaml` supplies version `1.0.0+5`. The initial release
archives remain at public version `1.0.0` until the first production release.
Increment the build number
for a subsequent distributed build, preserving the registered application ID and
signing identity. Product screens, data and theme preference belong to Next.js.

```sh
# Standard Android emulator; physical devices need a reachable development origin.
flutter build apk --debug --dart-define=APP_ENV=development

# Delivery builds require the signing configuration described below.
python tool/package_release.py android
```

Debug permits a public `DEV_APP_ORIGIN` define and uses Android's development
signing identity. Release/Profile select the fixed HTTPS production origin
`https://goalhint.com`; a development environment or `DEV_APP_ORIGIN` is rejected
by the app's configuration boundary. A successfully compiled artifact does not
prove that its web origin is available. Check the origin and installed app before
distribution. [Development routing and host workarounds](development-urls.md)
describe LAN/emulator addresses and Wi-Fi debugging.

The delivery command completes a fresh universal Release APK build, then uses
the configured Android SDK's `apksigner` and `aapt` to verify signatures,
application ID, version/build number and absence of the debuggable flag. It
rejects Android Debug certificates. Only successful verification produces
root `deploy/goal-hint-android-1.0.0.zip`, containing the APK and a brief
installation note, plus a SHA256 sidecar. Use `--force` only to replace the
unpublished package explicitly. Credentials never enter the archive. All
delivery staging stays under root `deploy/.staging/`.

Compiler intermediates are generated under ignored `build/`:

| Command | Artifact |
| --- | --- |
| Debug APK | `build/app/outputs/flutter-apk/app-debug.apk` |
| Release bundle | `build/app/outputs/bundle/release/app-release.aab` |
| Split release APKs | `build/app/outputs/flutter-apk/app-<ABI>-release.apk` |

An AAB is a store input, not a directly installable APK. Use a controlled Play
testing track or Android's bundle tooling to validate its delivered APKs. APKs can
be installed with `adb -s <device-id> install -r <artifact.apk>` after explicit
device acceptance resumes. No Android install/device checks were resumed for
step 007. A replacement APK must match the existing installation's signing
certificate; do not uninstall an existing app merely to bypass that check.

## Release signing boundary

The release Gradle configuration never falls back to Android's debug key. Its
`verifyReleaseSigning` task blocks release prebuild/signing when any required
value is missing or the keystore is not a regular file. Debug builds do not need
release credentials. Android's signing tasks then validate the actual key,
passwords and alias; this gate does not replace certificate verification.

The release owner supplies the appropriate existing upload/signing key and keeps
its backup outside the repository. Do not substitute a generated validation key
for the registered identity. Android requires signed installable APKs, while
Play App Signing separates the upload key from the key used for delivered apps.
[Android's signing guide](https://developer.android.com/studio/publish/app-signing)
explains identity and update-key management.

For a local build, copy `android/key.properties.example` to the ignored
`android/key.properties` and replace every placeholder:

```properties
storeFile=C:/private/goal-hint/upload-keystore.jks
storePassword=YOUR_LOCAL_SECRET
keyAlias=upload
keyPassword=YOUR_LOCAL_SECRET
```

Use an absolute path; relative paths resolve from `flutter/android/`. Forward
slashes avoid Java-properties backslash escaping on Windows. The example is
public documentation only; actual properties and `.jks`/`.keystore` files remain
ignored. Keep them out of source control, artifacts and logs. Flutter documents
this standard [Kotlin DSL signing setup](https://docs.flutter.dev/deployment/android#configure-signing-in-gradle).

A secured build environment may inject these values instead of writing a file:

| Environment variable | Local property |
| --- | --- |
| `GOAL_HINT_ANDROID_STORE_FILE` | `storeFile` |
| `GOAL_HINT_ANDROID_STORE_PASSWORD` | `storePassword` |
| `GOAL_HINT_ANDROID_KEY_ALIAS` | `keyAlias` |
| `GOAL_HINT_ANDROID_KEY_PASSWORD` | `keyPassword` |

Each supplied environment value overrides its corresponding local property,
including an empty value, so an incorrectly configured secret fails validation.
Prefer supplying all four through the build service's secret store. Do not put
passwords in command arguments, Dart defines, committed workflow text or build
output. This repository does not create, upload or register release credentials.

Verify a produced APK using the selected SDK's
`apksigner verify --verbose --print-certs <artifact.apk>` and compare its public
certificate fingerprint with the intended distribution identity. For an AAB,
use `jarsigner -verify -verbose -certs <artifact.aab>` and validate generated APKs
through the chosen testing channel. Record hashes, version, signing identity and
actual installed acceptance before calling an artifact released.

## Local gate and compilation evidence

On 26 October 2026, no `android/key.properties` or signing environment values were
present on this Windows host. `flutter build apk --debug
--dart-define=APP_ENV=development` passed (`assembleDebug` 174.2s). APK inspection
confirmed the application ID/name/version above, min SDK 24/target SDK 36,
`arm64-v8a`, `armeabi-v7a`, and `x86_64`, with development-only debuggable and
cleartext flags. `apksigner` verified its Android Debug certificate and v2
signature. The 184,924,557-byte APK's SHA-256 was
`7b302ba5393009b94e6371a866b127805e10ceba35557fb384ba18b7cf6b208b`.

The actual `:app:preReleaseBuild` invocation stopped at `verifyReleaseSigning`
with the expected missing-signing error (exit 1, 14s). This is a successful
negative gate check, not a successful release build. A 27s Gradle dry-run of
`:app:assembleRelease :app:bundleRelease` confirmed both artifact graphs include
the signing gate; dry-run success is not artifact creation. A direct gate check
using synthetic environment values and a nonexistent keystore also rejected the
missing file (exit 1, 12s), without creating keys or reading real credentials.
Ignored logs are under
`.dart_tool/release007-android-*.log`. No release key was generated, no debug key
was used for a new release, and no Android device state was changed.

At the time of that historical check, older
`build/app/outputs/apk/release/app-release.apk` and
`build/app/outputs/flutter-apk/app-release.apk` copies remained untouched. Their
17:00:58/59 timestamps predate this step's signing configuration; they are stale
validation output and must not be distributed as current signed releases. A
failed command does not make a pre-existing artifact current.

The Windows host has a stale inherited `JAVA_HOME`; select its installed JDK 17
for the build process. If necessary, reuse the README's scoped `.dart_tool/jtmp`
and Kotlin incremental-cache workarounds. These are process-local settings and
do not change global Java, Gradle, SDK or phone configuration.
The installed SDK command-line reader reported XML-v3/v4 skew; Gradle also
reported its existing Kotlin/legacy-DSL deprecation warnings. Those did not block
the debug compilation or the expected signing rejection; migration needs a
separate toolchain qualification, rather than changing the pinned template and
plugins during release acceptance.
