# Production packages

All five production ZIPs belong here. The first release version is **1.0.0**;
keep it until the first production deployment. Linux is excluded. Build scripts
and this guide are committed; generated ZIPs, checksums, staging files and private
configuration are ignored. A missing ZIP means that platform has not been built.

| ZIP | Contents and use |
| --- | --- |
| `goal-hint-nextjs-1.0.0.zip` | Complete cPanel/Passenger Node.js application. Extract and follow its `DEPLOY.md`; configure production secrets on the server. |
| `goal-hint-android-1.0.0.zip` | Signed Android APK. Extract, verify its checksum and install the APK on a compatible Android device. |
| `goal-hint-windows-1.0.0.zip` | Windows x64 installation executable and instructions. Extract and run the setup executable; Microsoft WebView2 Runtime is required. |
| `goal-hint-ios-1.0.0.zip` | Signed iPhone/iPad `.ipa` (the iOS package format). Distribute through its configured Apple provisioning channel. |
| `goal-hint-macos-1.0.0.zip` | Signed, notarized macOS disk image. Extract, open the `.dmg` and follow its installation instructions. |

## Build

From the repository root, with the app's pinned toolchain available:

```powershell
npm --prefix next-js run package:cpanel
python flutter/tool/package_release.py android
python flutter/tool/package_release.py ios --export-options /private/ExportOptions.plist
python flutter/tool/package_release.py macos --dmg /private/goal-hint.dmg
```

For Windows, run the following on the Windows build host, supplying its installed
x64 Visual Studio CRT directory:

```powershell
& ./flutter/tool/windows/package.ps1 -RedistDirectory 'C:/Program Files/Microsoft Visual Studio/18/Community/VC/Redist/MSVC/14.51.36231/x64/Microsoft.VC145.CRT'
```

Android needs the owner's release-signing key. iOS and macOS packaging runs on a
Mac with Xcode and the owner's Apple signing/provisioning setup. macOS packaging
accepts a completed, signed and notarized disk image. Missing tools or identities
stop packaging; no substitute debug or empty ZIP is produced. Building a package
does not deploy it or establish that its production services are available.

See the [cPanel guide](../next-js/docs/deployment/README.md),
[Android signing](../flutter/docs/android-release.md),
[Windows packaging](../flutter/docs/windows-release.md) and
[native release requirements](../flutter/docs/releases.md) for prerequisites.

## Local configuration

Existing private cPanel environment files, credentials and operator state are
preserved in `.private/nextjs/`. They must stay out of distributable ZIPs and Git.
`.staging/` holds temporary packaging files. Application build caches remain
ignored inside their application folders; final distribution archives go here.
