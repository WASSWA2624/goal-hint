# Android and Windows app downloads

The header, mobile icon, More menu and `/{locale}/download` are available in both
development and production. They share the existing theme and control tokens.
Only Android and Windows are offered; device detection never prevents choosing
the other platform. Downloads start only after a user action.

| Environment | Android | Windows |
| --- | --- | --- |
| Development | Local APK from `/api/downloads/android` | Local setup EXE from `/api/downloads/windows` |
| Production | Configured Google Play listing | Hosted production setup EXE |

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

Set these in the private production environment after the store release exists:

```dotenv
GOAL_HINT_ANDROID_PLAY_STORE_URL=
GOAL_HINT_ANDROID_PLAY_STORE_VERSION=
GOAL_HINT_ANDROID_PLAY_STORE_BUILD=
```

The URL must be an HTTPS `play.google.com/store/apps/details?id=...` listing.
While blank, the Android production page says the Play release is coming soon.
The URL alone enables the store link. Set the actual published native semantic
version and numeric build number to enable accurate in-app update checks; no
version is inferred from the web package or an unreleased native source version.

`GOAL_HINT_APP_DOWNLOADS_ROOT` optionally overrides the installer root. When
blank, the runtime uses `.app-downloads` in its working directory. A custom root
must also be passed to `scripts/app-downloads.py --root ...` when preparing files.
Production/development catalogs cannot be interchanged.

## Production deployment

Package Windows through `flutter/tool/windows/package.ps1` as usual. Its delivery
ZIP includes a small `download-manifest.json` with the actual version/build and
installer hash. Existing older packages need repackaging before web publication.

`scripts/deploy-cpanel.py` automatically publishes the available production
Windows package before activating a web release. It verifies the archive hash,
extracts only the installer, verifies its hash again on the host, then switches
the catalog after the file exists. Missing production archives preserve existing
hosted downloads. Invalid present archives stop publication rather than
promoting a development file. This step does not build native binaries or upload
Android apps to Google Play.

Hosted installers live under `~/<app>-downloads/`, linked into each web release.
Old versioned installers are retained and a website rollback does not remove
them. Replacing an existing version/build with different bytes is rejected;
increment the native build number. Existing Windows packaging is unsigned;
website hosting does not add an Authenticode signature.

## Invitations and updates

Supported web browsers receive a dismissible invitation after initial loading.
The download page and account/payment flows suppress it. Later dismisses the
current release for seven days; a download request or “I already have the app”
suppresses that release. A newer release can be offered again, while rollbacks
do not trigger an older-release offer. Storage is per browser and platform; no
account-level device tracking or claim of confirmed installation is made.

Android/Windows native hosts append installed package identity before loading
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
host is the recommended follow-up for a small wrapper. The production Play
listing stays unavailable until configured. No small-APK result is claimed yet.
