# Development and production URLs

Evidence checked **26 October 2026 (Africa/Kampala)** for [plan 002](../dev-plan/002-environment-urls.md). The shell selects one web origin; Next.js owns its routes, interface and server behavior. This step configures addresses and platform transport policy. [Plan 003](../dev-plan/003-web-app-integration.md) now provides browser adapters; installed loading is verified on available Windows and Android targets. A successful HTTP probe alone is still not evidence of native browser/session behavior.

## Public build configuration

| Setting | Meaning |
| --- | --- |
| `APP_ENV=development` | Select the development origin in Debug only; this is the Debug default. |
| `APP_ENV=production` | Select `https://goalhint.com`; this is the Profile/Release default. Any `DEV_APP_ORIGIN` is rejected. |
| `DEV_APP_ORIGIN` | Optional Debug-development HTTP/HTTPS origin. Include scheme, host and optional port, without credentials, an application path, query or fragment. |
| Profile/Release build | Accept production configuration only, using the fixed `https://goalhint.com` origin. Development defines produce a configuration error instead of silently changing environments. |

Pass these values with Flutter's `--dart-define`. They are compilation configuration, not a request to read an operating-system environment variable or the Next.js `.env.local` file. Changing defines requires a new run/build, rather than a source edit. Origins are public data embedded in the bundle: never put administrator credentials, session tokens, API keys or private environment-file contents in them. [Dart environment declarations](https://dart.dev/libraries/core/environment-declarations).

Use an origin such as `http://192.168.1.148:3000`, not `http://192.168.1.148:3000/en?token=...`. Next.js handles navigation from the origin to its normal entry route. URL validation cannot make an unreachable host reachable or grant native transport/privacy permissions.

## Which development address to use

| Running target | Development default | Override when needed |
| --- | --- | --- |
| Windows/macOS/Linux desktop on the server's computer | `http://localhost:3000` | The reachable computer address if Next.js runs on another machine, VM or container. |
| Standard Android Emulator | `http://10.0.2.2:3000` | A reachable LAN origin or another explicitly configured emulator network. `10.0.2.2` is the Android Emulator's alias for the development host's loopback; emulator `127.0.0.1` is the emulator itself. [Android network address space](https://developer.android.com/studio/run/emulator-networking-address). |
| iOS Simulator on the Mac running Next.js | `http://localhost:3000` | The server computer's LAN origin when it is not the simulator's Mac. The simulator uses its Mac host network; a simulator running on a remote Mac does not reach a Windows server through the Mac's `localhost`. [Microsoft's official simulator networking guide](https://learn.microsoft.com/en-us/dotnet/maui/data-cloud/local-web-services). |
| Physical Android/iPhone/iPad | No automatic host discovery | Set `DEV_APP_ORIGIN` to the development computer's reachable LAN origin, for example `http://192.168.1.148:3000`. On a physical phone, `localhost` means that phone. The Android emulator alias is not a physical-device address. |

The LAN address above is an example, not a reserved address for this project. Find the server computer's current address using its network settings (`ipconfig` on Windows), and keep both devices on a network that permits communication between them. Guest Wi-Fi/client isolation, VPN routing and host firewalls can prevent access. An address that changes with DHCP requires a new development define. Do not use `0.0.0.0` as the client URL: it is a server binding address.

## Start Next.js and run the shell

Run the existing web workflow from `next-js/`:

```sh
npm ci
npm run dev
```

Next.js documents the development hostname default as `0.0.0.0` and port default as `3000`. When checking an explicit network binding, run the following alternative from `next-js/`, with the other dev server stopped:

```sh
npx next dev --webpack --hostname 0.0.0.0 --port 3000
```

Allow the development port through the computer's firewall for the intended private network. A bind address, firewall rule and reachable client URL are separate requirements. [Next.js CLI](https://nextjs.org/docs/app/api-reference/cli/next).

Run Flutter commands from `flutter/`. For Windows development:

```powershell
& .\tool\windows\run-dev.ps1
```

This launcher explicitly selects Debug, `APP_ENV=development`, and
`DEV_APP_ORIGIN=http://localhost:3000`. Keep the Next.js server running in a
separate terminal. For a different local server port, pass `-Port 3001`.
The repository's VS Code **Goal Hint Windows (local development)** launch
configuration selects the same origin and mode. The equivalent direct command is:

```sh
flutter run -d windows --debug --target=lib/main.dart --dart-define=APP_ENV=development --dart-define=DEV_APP_ORIGIN=http://localhost:3000
```

The installed **Goal Hint** Start menu/taskbar shortcut opens the production
release, which still uses `https://goalhint.com`. Launch the development build
with the command or debugger above to see localhost. It builds in the workspace;
it does not replace the installed release. Changing defines requires stopping
and starting Flutter again. Refreshing a production build cannot switch its
compiled origin to localhost.

For a connected physical device, replace the example IP with the server computer's LAN address and select the intended target if Flutter finds several:

```sh
flutter devices
flutter run --dart-define=APP_ENV=development --dart-define=DEV_APP_ORIGIN=http://192.168.1.148:3000
```

For the standard Android Emulator, explicitly select its device ID with `-d` when several devices are present; the default development origin is already `10.0.2.2`. For production configuration in a Debug run, use `--dart-define=APP_ENV=production` and omit `DEV_APP_ORIGIN`. A normal Android release build is:

```sh
flutter build apk --release --dart-define=APP_ENV=production
```

The production URL is fixed by the shared configuration; neither command uploads, deploys or publishes the website or app.

## Android wireless development

Android 11+ supports TLS wireless ADB. Use current Android SDK Platform Tools,
connect the phone and computer to the same Wi-Fi, and enable Developer options
→ Wireless debugging. Open **Pair device with pairing code** to read the pairing
endpoint. Enter the code interactively when prompted. The pairing port and
connection port differ; read the connection endpoint from the main Wireless
debugging screen. [Official ADB guide](https://developer.android.com/tools/adb#connect-to-a-device-over-wi-fi).

Replace the placeholders with the phone's current values:

```sh
adb pair <phone-ip>:<pairing-port>
adb connect <phone-ip>:<connection-port>
adb devices -l
flutter devices
adb -s <wireless-device-id> shell getprop ro.build.version.sdk
flutter run -d <wireless-device-id> --dart-define=APP_ENV=development --dart-define=DEV_APP_ORIGIN=http://<computer-lan-ip>:3000
```

mDNS may connect an already paired device automatically. Select the exact
wireless ID shown by `flutter devices`; USB, mDNS and explicit IP transports
may coexist. IPs/ports can change. Keep pairing codes and host authorization
keys out of scripts, logs and Git.

Wireless ADB installs/debugs Flutter. Web traffic separately uses
`DEV_APP_ORIGIN`: the normal app reaches Next.js over LAN/Wi-Fi without an ADB
tunnel or USB cable. This setup retains normal TLS/certificate validation and
firewall policy. An isolated fixture may need its own temporary ADB mapping;
remove only that owned mapping after testing, preserving the wireless pairing.

Offline preparation additionally requires a **production-like web build** and a
secure context (production HTTPS or recognized localhost/loopback). Normal
`next dev`/LAN HTTP is online/HMR development and does not prepare this cache.
Use the [offline guide](offline-startup.md) for the build, origin and retained
profile requirements; pairing alone does not make a LAN HTTP origin secure.

## Inspect the selected origin

To inspect the same configuration without a WebView, use the development helper
from `flutter/`:

```sh
dart run tool/resolve_origin.dart
dart run --define=APP_ENV=development --define=DEV_APP_ORIGIN=http://192.168.1.148:3000 tool/resolve_origin.dart --android
```

It prints only the resolved public environment and origin. It exits with code
64 for invalid configuration and does not fetch the website. Its optional
`--android` argument selects Android's emulator default; it does not discover or
connect to a phone. Dart AOT compilation selects production by default, matching
the shell's Release configuration.

## Next.js development origins

`next-js/next.config.ts` owns the web server's `allowedDevOrigins`. It is a development-asset/HMR protection, separate from interface binding and application authentication. Its entries contain **hostnames only**, without `http://`, a port or a path. Next.js checks the Origin hostname, or the Referer hostname for relevant requests without an Origin. A `*` matches a hostname label, not an arbitrary substring. [Next.js allowedDevOrigins](https://nextjs.org/docs/app/api-reference/config/next-config-js/allowedDevOrigins).

The configured entries cover `127.0.0.1`, `[::1]`, `10.0.2.2`, and `192.168.*.*`; localhost is already allowed by Next.js. Add a specific host or appropriate private-network pattern when using a LAN outside that range. Keep entries restricted to intended development hosts; do not turn the list into unrestricted `*` access. After changing this configuration, restart the development server and check both page loading and dev assets/HMR. A page returning HTML while hydration assets are blocked is not a successful device-access check.

## Native transport and privacy policy

Native policy is selected at build time. A Dart origin override does not itself edit Android XML, Apple property lists or macOS entitlements.

### Android

Declare `android.permission.INTERNET` for the application, including Release; Flutter's [networking guide](https://docs.flutter.dev/data-and-backend/networking) documents this permission. Permit development HTTP only through the Debug manifest/resource variant. Profile and Release retain HTTPS-only cleartext policy, normal trust validation and the fixed production URL.

Android's [Network Security Configuration](https://developer.android.com/privacy-and-security/security-config) supports cleartext policy and domain-specific rules. Apps targeting API 28+ default to denying cleartext. Its `<debug-overrides>` element configures debug certificate trust, not a cleartext allowance; it is ignored when `android:debuggable` is false and does not make Profile a development variant. Check each merged manifest and variant's effective XML. Do not add a certificate-accept-all callback or ship development trust anchors.

The manifest [`usesCleartextTraffic`](https://developer.android.com/guide/topics/manifest/application-element) flag is not a substitute for checking effective network configuration: Android documents that Network Security Configuration takes precedence where present, and that WebView honors the flag for apps targeting API 26+. Validate the actual WebView policy in plan 003; a Dart socket probe is insufficient.

### iOS and macOS: ATS

Use a Debug-specific Info.plist selection for development allowances, with Profile and Release selecting the normal plist. Xcode's [`INFOPLIST_FILE`](https://developer.apple.com/documentation/xcode/build-settings-reference) setting selects that input. Inspect the final built plist as well as source configuration.

Apple documents [`NSAllowsLocalNetworking`](https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity/nsallowslocalnetworking) for local names/addresses. Its current documentation distinguishes older behavior from **iOS 17/macOS 14**, where IP-address connections are no longer allowed by default and individual IP/CIDR exceptions are supported through `NSExceptionDomains`. Do not assume the local-network key alone proves every numeric LAN URL works. Cover only the intended development hosts/ranges in the development policy and test the selected OS versions; use trusted HTTPS for development hosts outside that policy.

For a required development HTTP host exception, [`NSExceptionAllowsInsecureHTTPLoads`](https://developer.apple.com/documentation/bundleresources/information-property-list/nsexceptionallowsinsecurehttploads) applies within that host's exception dictionary. This does not make a mismatched/untrusted HTTPS certificate valid. Keep TLS certificate checks intact. Neither `NSAllowsArbitraryLoads` nor `NSAllowsArbitraryLoadsInWebContent` belongs in Profile or Release for this fixed-HTTPS shell. [Apple ATS guidance](https://developer.apple.com/documentation/security/preventing-insecure-network-connections).

### Apple local-network privacy

ATS and local-network privacy are different gates. Include a meaningful Debug-development [`NSLocalNetworkUsageDescription`](https://developer.apple.com/documentation/bundleresources/information-property-list/nslocalnetworkusagedescription) when the app connects to the development machine over the LAN. The user may need to allow local-network access in Settings. The simulator does **not** exercise the local-network privacy permission; verify it on a real Apple device. macOS has its own local-network privacy behavior, including differences between a Terminal-launched tool and an installed application. Do not treat a successful host command as installed-app permission evidence. [Apple TN3179](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy).

### macOS App Sandbox

Outbound web access needs [`com.apple.security.network.client`](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.security.network.client) in both DebugProfile and Release entitlement files. This is required for production HTTPS too; it is not an HTTP exception. Preserve the existing Debug/Profile JIT and incoming `network.server` entitlements used by Flutter tools. A shell that only initiates web connections does not need a Release server-listening entitlement. [Flutter macOS entitlements](https://docs.flutter.dev/platform-integration/macos/building).

## Verification and handoff

Record actual configuration tests, selected target URLs, native build modes and network responses in [the tracker](../dev-tracker.md). Keep unavailable devices/hosts marked untested.

1. Verify valid origins and useful errors for malformed environment/URL input, including userinfo, a route path, query or fragment. Verify Debug-development overrides, production rejection of any development override, and configuration errors for development in Profile/Release. Valid Profile/Release configuration resolves only to the fixed HTTPS production origin.
2. Confirm Next.js responds through desktop loopback and each available emulator/LAN address, and that the relevant dev assets are allowed. Record the address and target actually used; host reachability alone does not prove emulator/device reachability.
3. Inspect effective Android Debug/Profile/Release transport configuration and Apple configuration-specific plists/entitlements. Verify development HTTP exceptions are absent from both Profile and Release.
4. Complete installed-app loading/navigation and native WebView transport checks in plan 003. Plan 002's original acceptance item requiring the installed app to load the website stays dependent on that integration; do not mark it passed from the configuration screen, a browser or an HTTP probe.

Browser integration and identity implementation now have their own recorded
qualification in 003/006. Offline persistence and reconnection remain 004–005.
No Next.js private environment file is copied into Flutter.
