# App downloads

The header, mobile icon, More menu and `/{locale}/download` are available in both
development and production. They share the existing theme and control tokens.
The page offers Android, Windows, iOS, macOS and Linux. Device detection
recommends a platform and the user can choose any platform. Downloads start
after a user action.

| Platform | Development | Production |
| --- | --- | --- |
| Android | Local APK | Hosted signed APK, with a configured Google Play fallback |
| Windows | Local setup EXE | Hosted setup EXE |
| iOS | Coming soon | Published App Store listing or public TestFlight invitation |
| macOS | Coming soon | Hosted signed and notarized DMG |
| Linux | Coming soon | Hosted signed Debian package |

Platforms without a published release show “Coming soon.”

## Local development

`npm run dev` and `npm run dev:live` prepare downloads from the existing checked
native delivery ZIPs in root `deploy/`. Missing packages leave that platform
unavailable. Source archives, private configuration and native delivery ZIPs are
never served. Only the extracted installer is public.

Rebuild development packages through `flutter/tool/package_development.py`, using
the desired native origin. A physical Android device must reach the development
computer's LAN origin; its own `localhost` points to the phone. Preserve the
existing Android signing key and app data when updating development builds.

Run `npm run downloads:prepare` after replacing native delivery packages while
the web server is already running. Published files live in ignored
`next-js/.app-downloads/`; they are separate from the web source and build.

## Production settings

An existing Google Play release can serve as a fallback while a hosted APK is
unavailable. Set these in the private production environment for that fallback:

```dotenv
GOAL_HINT_ANDROID_PLAY_STORE_URL=
GOAL_HINT_ANDROID_PLAY_STORE_VERSION=
GOAL_HINT_ANDROID_PLAY_STORE_BUILD=
```

The URL must be an HTTPS `play.google.com/store/apps/details?id=...` listing.
The URL alone enables the store link. Set the actual published native semantic
version and numeric build number to enable accurate in-app update checks; no
version is inferred from the web package or an unreleased native source version.

For iOS, set `GOAL_HINT_IOS_DISTRIBUTION_URL` to the actual App Store listing or
public TestFlight invitation. `GOAL_HINT_IOS_DISTRIBUTION_VERSION` and
`GOAL_HINT_IOS_DISTRIBUTION_BUILD` enable installed-version checks. The catalog
uses the published Apple channel, and the provisioned IPA stays with the release
owner.

`GOAL_HINT_APP_DOWNLOADS_ROOT` optionally overrides the installer root. When
blank, the runtime uses `.app-downloads` in its working directory. A custom root
must also be passed to `scripts/app-downloads.py --root ...` when preparing files.
Production/development catalogs cannot be interchanged.

## Production deployment

Use the [native release packaging commands](../../flutter/docs/releases.md).
Production delivery ZIPs include `download-manifest.json` with the actual
version/build, signature verification and installer hash. Existing older
packages need repackaging before new publication.

For manual VPS publication, prepare a production-only download root with
`python scripts/app-downloads.py --channel production --root <download-root>`.
Copy the validated, versioned `files/` entries into the private installer root,
verify their SHA-256 on the host and publish the catalog atomically after all
listed files exist. Configure `GOAL_HINT_APP_DOWNLOADS_ROOT` to use that root.
The legacy `scripts/deploy-cpanel.py` uploader also verifies upload and installer
hashes and retains active entries for platforms absent from a new upload.

Hosted installers live under `~/<app>-downloads/`, linked into each web release.
Old versioned installers are retained and a website rollback does not remove
them. Replacing an existing version/build with different bytes is rejected;
increment the native build number. Sign the Windows EXE during native packaging
before publishing it.

## Invitations and updates

Supported web browsers receive a dismissible invitation after initial loading.
The download page and account/payment flows suppress it. Later dismisses the
current release for seven days; a download request or “I already have the app”
suppresses that release. A newer release can be offered again, while rollbacks
do not trigger an older-release offer. Storage is per browser and platform; no
account-level device tracking or claim of confirmed installation is made.

Native hosts append installed package identity before loading
the website. The shared runtime suppresses install invitations inside the host
and offers an update only when a newer native version/build is published in the
same environment. Unknown package metadata suppresses the install invitation
without inventing an update. Update installers open in the system browser.
The release catalog refreshes on focus and every five minutes while visible.
Website-only deployments do not advance native versions.

## Verification and remaining packaging work

Download/runtime/navigation/configuration checks pass (59 Node tests), as do six
download publisher tests, native analysis and the native test suite. Browser
checks cover both themes, 320/390px mobile and 1440/1920px desktop, platform
switching, actual installer downloads, prompt dismissal, new-release offers and
current/outdated native identities. The Windows development installer is build 7.

The broad Python script suite reports ten existing failures in migration
snapshot/trigger and paywall verifier tests; their source and Prisma inputs are
unchanged by this work. See the local verification log under ignored `output/`.

Android's existing universal debug APK remains a development artifact. Flutter
debug engines, multiple CPU architectures and debug graphics tooling account
for most of its size; it does not bundle the website. A native Android WebView
host is the recommended follow-up for a small wrapper. Signed production packages
and native device acceptance depend on the platform toolchains and release
signing configuration.
