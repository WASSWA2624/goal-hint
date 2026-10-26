# Windows release candidates

Run commands from `flutter/` on the Windows build host. The scripts use Windows
PowerShell 5.1 or PowerShell 7, and the SDK pinned in
[`release-toolchain.json`](../release-toolchain.json). A candidate is a ZIP with
a per-user installer, not an MSIX/store submission or a published release.
Native changes require a newly built bundle and an incremented `pubspec.yaml`
build number. Product screens and business logic continue to come from Next.js.

## Build and package

Install the pinned Flutter SDK, Visual Studio's desktop C++ workload and Windows
SDK, and place NuGet on the build process's PATH. Consult the
[verified host record](../dev-tracker.md) for versions and host-specific fixes.
Keep the lockfile; use normal `lib/main.dart`, never an integration-test target.

```powershell
flutter pub get
flutter build windows --release --target=lib/main.dart --dart-define=APP_ENV=production

& .\tool\windows\package.ps1 -SkipBuild `
  -RedistDirectory 'C:\Program Files\Microsoft Visual Studio\18\Community\VC\Redist\MSVC\14.51.36231\x64\Microsoft.VC145.CRT'
```

The CRT path above is this host's verified installation, not a portable default.
Locate the corresponding x64 `Microsoft.VC*.CRT` directory under the build host's
installed `VC/Redist/MSVC/<version>/`. The packager rejects other locations and
requires valid Microsoft signatures. It copies the release CRT DLLs beside the
application, following Flutter's documented application-local option. Source
them from the licensed Visual Studio redistributable installation; do not copy
random system DLLs or Debug libraries. Application-local runtime updates must
be shipped in a new native bundle. A centrally serviced Visual C++
Redistributable is an alternative deployment strategy, not installed by these
scripts. See [Flutter's Windows bundle guidance](https://docs.flutter.dev/platform-integration/windows/building)
and [Microsoft's redistribution guidance](https://learn.microsoft.com/cpp/windows/redistributing-visual-cpp-files).

Omit `-SkipBuild` to have the packager run the exact build command itself. Set
`-Flutter C:\flutter\flutter\bin\flutter.bat` if the pinned SDK is not on PATH.
`-SkipBuild` is for the immediately completed normal production build in the
same checkout; it is not a provenance attestation for arbitrary binaries.
Generated CMake configuration is checked for `lib/main.dart`, production-only
application defines, and the pinned Flutter/Dart revision. File versions,
required AOT/runtime outputs and package files are checked before publication
as a candidate. A build restored from an unknown machine/cache must be rebuilt.

The output is:

```text
build/releases/goal-hint-0.1.0+4-windows-x64/
build/releases/goal-hint-0.1.0+4-windows-x64.zip
build/releases/goal-hint-0.1.0+4-windows-x64.zip.sha256
```

The directory contains `goal_hint.exe`, native DLLs, `data/`, install/uninstall
scripts, a README and `manifest.json`. The manifest records version, public
origin, toolchain, source commit/dirty status, build-configuration hash, and each
file's length/SHA256. It contains no signing credentials or private build paths.
PDB/debug/test/private files are rejected or excluded. Existing candidate output
is preserved; the packager will not overwrite it. Keep all output ignored.

The ZIP checksum detects corruption when obtained from a trusted separate
channel. The embedded manifest checks extracted file consistency; neither is
a digital signature or publisher authentication. This workflow creates an
unsigned candidate. A public signed installer or MSIX/store release needs the
appropriate publisher identity, signing credentials and its own acceptance.
No certificate is created, imported or trusted by these scripts.

## Install, run and remove

Use an x64 Windows 10/11 host with 64-bit PowerShell and the Microsoft Edge
WebView2 Evergreen Runtime. Only hosts actually recorded in the acceptance
matrix are qualified. The installer reads Microsoft's documented per-user and
per-machine Evergreen registry keys; a preview Edge browser does not satisfy
this check. If absent, install the Runtime from Microsoft's
[WebView2 download page](https://developer.microsoft.com/microsoft-edge/webview2/)
and retry. See the [official detection/distribution contract](https://learn.microsoft.com/microsoft-edge/webview2/concepts/distribution).
It performs no network download or administrator installation itself.

Verify the received ZIP against its separately supplied SHA256, extract it,
inspect the scripts/manifest, then run in the extracted directory:

```powershell
Get-FileHash -Algorithm SHA256 .\goal-hint-0.1.0+4-windows-x64.zip
# After extraction, from the directory containing manifest.json:
powershell -File .\install.ps1 -DesktopShortcut
```

Run only reviewed scripts consistent with the machine's execution policy;
these instructions do not disable or change that policy. The installer verifies
all listed bytes and rejects unlisted files, path traversal, alternate streams,
links/junctions and invalid identity/origin before copying. It stages the copy
before activating a version and refuses an already installed version with
different contents. An unrelated existing `Goal Hint` directory or shortcut is
preserved and reported for manual resolution. Close the installed app before
installing another version or removing it.

The installation is per-user:

```text
%LOCALAPPDATA%/Programs/Goal Hint/installation.json
%LOCALAPPDATA%/Programs/Goal Hint/versions/0.1.0+4/goal_hint.exe
%APPDATA%/Microsoft/Windows/Start Menu/Programs/Goal Hint.lnk
```

The optional desktop shortcut uses the user's actual Desktop known folder.
Shortcuts use the bundled executable's Goal Hint icon; the native runner keeps
the stable `com.goalhint.goal_hint` AppUserModelID. The installer writes and reads
back that same persistent `System.AppUserModel.ID` property on each created
shortcut through the standard Shell `IPropertyStore`, so Windows can associate
the shortcut with the running application when grouping or pinning. This follows
[Microsoft's AppUserModelID contract](https://learn.microsoft.com/en-us/windows/win32/shell/appids)
and does not alter user pins or the icon cache. Start via either shortcut or
the installed executable. The full folder must stay together. Older managed
native versions remain available after an update; the website's normal updates
continue inside the persistent WebView profile without installing a new bundle.

Windows keeps its own copy of a pinned shortcut. The installer updates its
managed Start Menu/desktop links; it does not rewrite user pins or flush the
icon cache. After installing another native version, verify that an existing
pin launches the intended version and re-pin Goal Hint through Windows if it
still targets an older version. The same explicit app ID keeps grouping stable.

To remove the managed installation, close its windows and run:

```powershell
powershell -File "$env:LOCALAPPDATA\Programs\Goal Hint\versions\0.1.0+4\uninstall.ps1"
```

The uninstaller validates the fixed per-user root and each managed version's
manifest, removes only listed application files and shortcuts targeting that
root, then removes empty manifest-owned directories. Unlisted files remain.
It never recursively deletes a computed directory. Browser cookies, cache and
preferences under the existing application-support profile remain untouched;
uninstalling is not a logout or a private-data erasure operation.

## Checks and acceptance boundary

```powershell
& .\tool\windows\test-release.ps1
```

The dependency-free synthetic checks cover traversal/alias/duplicate/hash/link
rejection, preservation of unknown files/directories, normal production entry
point/toolchain rules and the missing-runtime failure. They do not install fake
binaries or change registry settings. Native build/install/production-site and
offline results belong in [007's acceptance matrix](../dev-plan/007-platform-builds-and-release.md)
and [the tracker](../dev-tracker.md). A suspended/unavailable deployed origin is
an online production-launch failure even when the local bundle installs.
Controlled development fixtures and previous step evidence do not qualify the
deployed production site or a store release.
