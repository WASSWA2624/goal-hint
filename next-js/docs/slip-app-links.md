# Shared-slip app links

Public slip links use `https://goalhint.com/s/<32 lowercase hexadecimal characters>`.
The website works independently of whether a native app is installed. The native
shell accepts this exact route on its configured origin, handles cold and warm
launches, and reuses its current WebView and session. It ignores other native
routes, external hosts, credentials, queries, fragments, and malformed tokens.
It does not copy business logic or slip screens into Flutter.

## Deployment configuration

The server exposes two public JSON association documents:

- `/.well-known/assetlinks.json` uses Android package `com.goalhint.goal_hint`.
  Set `GOAL_HINT_ANDROID_APP_LINK_SHA256` to the installed app's actual signing
  certificate SHA-256 fingerprint, written as 32 colon-separated hexadecimal
  pairs. Multiple approved signing certificates may be comma-separated (maximum
  16). When using Play App Signing, use the app signing certificate from Play,
  not the upload-key fingerprint.
- `/.well-known/apple-app-site-association` uses iOS bundle
  `com.goalhint.goalHint` and limits paths to `/s/*`. Set
  `GOAL_HINT_IOS_APP_LINK_TEAM_ID` to the real ten-character Apple team identifier
  used by the signed app. The Xcode target includes the associated-domain
  entitlement `applinks:goalhint.com` for Debug, Profile, and Release.

These identifiers and signing fingerprints are public configuration, not private
signing keys. Their values are intentionally blank in the committed example.
Absent or invalid association configuration publishes no app identity. Invalid
nonblank settings are also rejected by the central runtime-policy parser.

Serve both documents directly on the canonical HTTPS host, with JSON content
type and no authentication or redirection. The app must be rebuilt, signed, and
installed with the updated manifest/entitlement. The operating system decides
whether to open an installed app; prior app versions cannot gain these native
capabilities through a website update alone. In-app browsers and user link
preferences may still choose the website.

## Qualification

Automated checks cover association documents, configuration validation, strict
native URL acceptance, cold start, warm links, repeated links, initialization
races, and reuse of the original browser. This does not establish device-level
domain verification. Release fingerprints, an Apple team, a live deployed domain,
signed builds, and actual Android/iOS link verification remain external setup.

Recorded automated results: five association/configuration tests passed; all
51 Flutter tests passed, including eight new link/platform checks; targeted Dart
analysis and web ESLint passed. These results cover source behavior, not an
installed signed app's OS domain-verification state.

On an Android device with the new signed app installed, recheck with:

```sh
adb shell pm verify-app-links --re-verify com.goalhint.goal_hint
adb shell pm get-app-links com.goalhint.goal_hint
adb shell am start -a android.intent.action.VIEW -c android.intent.category.BROWSABLE -d "https://goalhint.com/s/ACTUAL_SHARED_SLIP_TOKEN"
```

Replace the last path segment with a real shared-slip token. Verify cold launch
and an already-running app. For iOS, enable Associated Domains for the real app
identifier and provisioning profile, deploy the association JSON, sign/install
from a macOS host, then test links from another app on a physical device.

Official references: [Flutter Android app links](https://docs.flutter.dev/cookbook/navigation/set-up-app-links),
[Flutter iOS universal links](https://docs.flutter.dev/cookbook/navigation/set-up-universal-links),
[Android domain verification](https://developer.android.com/training/app-links/verify-applinks),
and [Apple associated domains](https://developer.apple.com/documentation/xcode/supporting-associated-domains).
