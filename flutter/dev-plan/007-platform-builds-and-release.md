# 007 - Platform builds and release acceptance

**State: Partial — reproducible build/package and signing gates implemented; production hosting and remaining platform acceptance prevent a qualified release.** Prerequisites: [001](001-foundation-and-platform-support.md), [002](002-environment-urls.md), [003](003-web-app-integration.md), [004](004-persistent-offline-startup.md), [005](005-reconnection-and-cache-updates.md), and [006](006-app-identity-and-theme.md). Follow [the specification](../../app-write-up.md) and [the shell requirements](../../prompts/flutter-app-shell.md).

## Outcome

Provide reproducible installable builds and documented, meaningful acceptance evidence for Android, iOS, Windows, macOS, and Linux.

## Work

- Document commands run from `flutter/`, the pinned toolchain, supported target/OS versions, native WebView runtimes, and the host required to build each target. Record Android SDK/JDK, Apple build tools, Windows desktop tools, and Linux dependencies as verified at implementation time.
- Document debug/development and production build configurations, app identity, artifact locations, and install/run steps. Apply platform-required signing, provisioning, or notarization to requested release builds using local or secured credentials.
- Build and install on actual available targets. Record device/emulator/OS, WebView runtime, build mode/version, and precise results. Do not label a target supported merely because a plugin lists it, or label an untested package released.
- Verify the deployed web origin and a representative website-only update in the installed shell. Normal screens and business logic must update through Next.js without rebuilding Flutter; native configuration changes require new native artifacts where applicable.
- Maintain the matrix below with **Pass**, **Fail**, **Not tested**, or **Unsupported**, plus links to evidence and remediation. Keep unavailable host/toolchain limitations explicit and complete independent verifiable work.

## Acceptance matrix

| Scenario | Android | iOS | Windows | macOS | Linux |
| --- | --- | --- | --- | --- | --- |
| Build, install, online production launch | Not tested | Not tested | Fail | Not tested | Unsupported |
| Development URL from emulator/device or desktop | Pass | Not tested | Pass | Not tested | Unsupported |
| Navigation, back/external links, account lifecycle | Not tested | Not tested | Not tested | Not tested | Unsupported |
| Icon, splash, light/dark theme, resizing/input/accessibility | Not tested | Not tested | Not tested | Not tested | Unsupported |
| First launch offline without an existing cache | Pass | Not tested | Pass | Not tested | Unsupported |
| Online warmup then terminated-app offline cold start | Not tested | Not tested | Pass | Not tested | Unsupported |
| Uncached route and unavailable server-dependent action | Not tested | Not tested | Pass | Not tested | Unsupported |
| Logout/account isolation then offline reopen | Not tested | Not tested | Pass | Not tested | Unsupported |
| Reachability recovery and safe website-only update | Not tested | Not tested | Pass | Not tested | Unsupported |
| Interrupted/failed update retains last working version | Not tested | Not tested | Pass | Not tested | Unsupported |
| Cache eviction/corruption and recovery | Not tested | Not tested | Pass | Not tested | Unsupported |

### Evidence scope and remediation

Pass entries above are deliberately scoped native development-fixture evidence,
not production Release qualification. Grouped scenarios stay Not tested when
required subchecks are missing. See the dated
[001–006 handoffs](../dev-tracker.md) and
[native reproduction commands](../integration_test/README.md):

- 007's normal Windows x64 Release build passed, and the extracted candidate
  installed under the fixed per-user root with Start Menu/desktop shortcuts.
  The installed native process displayed the provider's Account Suspended page
  at the configured production origin; the grouped production-launch row is
  **Fail**. The original +1 candidate was removed through its bounded uninstaller;
  the browser profile was retained. The 27 October follow-up installed candidate
  `0.1.0+4`, verified matching process/shortcut AppUserModelIDs and visually checked
  the desktop and actual pinned taskbar icon. Its Windows-only artwork fit grew
  from about 67% to 90%, with a white football and transparent outer tile. The
  +4 installation/pin remain for the owner's requested icon correction. The
  unsigned ZIP is a local candidate, not a published release. Complete
  appearance/input/accessibility qualification is recorded separately below.

- Android Pass entries are historical physical-device results from 002/004
  (API 35/System WebView 155). No current device, ADB, installation or runtime
  checks were performed after the owner's explicit deferral. Resume those checks
  before qualifying the current source or release artifact.
- Windows development loading, first-use Retry, actual warm/terminated-process
  cold start, uncached recovery, failed server actions, failed-update retention,
  scoped corruption/eviction and recovery passed in 002–005 on Windows 11 x64 /
  WebView2 155. These used isolated anonymous loopback fixtures, with the owned
  app-origin server unavailable while Wi-Fi remained available. They do not
  claim production-host behavior, OS radio switching or real financial actions.
- Synthetic web account transport/back/session checks passed in 003, but real
  account-backend and system handler/picker coverage remains incomplete. Those
  limits are separate from the native offline isolation proof below.
- On 27 October 2026 (EAT), all seven Windows native privacy phases passed:
  anonymous preparation, A and B sessions with separate offline process restarts,
  real shared-handler logout, another offline cold restart, and strict cleanup.
  Real cookie/session/HTTP code used isolated synthetic authentication/storage
  at `offline-identity.localhost:3196`, keeping normal development cookies apart.
  Private JSON/RSC remained no-store, every cache/DOM audit excluded A/B private
  fields/token bytes, and offline POSTs failed without replay (counter zero).
  Cookie absence survived cold reopen before cleanup. Only the dedicated host's
  worker/cache and owned servers were cleaned; native/browser processes exited.
  This qualifies the Windows fixture row, not a real account database or the
  suspended production deployment. See
  [measured native privacy evidence and reproduction](../docs/offline-identity-acceptance.md).
- 006 passed actual Windows OS light/dark changes, shared website preference,
  document reload and separate-process restart. The 007 follow-up also passed
  the real shared light/dark controls, all native palette values and caption
  observation, with the fixture's original theme preference restored. Installed
  Windows desktop and pinned taskbar identity were visually verified. The owner
  confirmed text entry and Tab navigation, and a native Back action returned the
  saved draft; however, navigation before the keyboard checkpoint reset the
  fixture's input counters, and control-tool focus/capture recovery was unreliable.
  The ordered UI harness failed its focus assertion and does not qualify the
  remaining keyboard, resize/zoom, handler, picker, lifecycle or assistive-technology
  checks. Those grouped rows remain **Not tested**, without claiming a product
  keyboard or screen-reader failure. See
  [the native UI guide and actual attempts](../docs/windows-ui-acceptance.md).
- 007 additionally passed an independent website-only deployment: one native
  Debug process loaded actual Next.js builds A and B at the same loopback origin,
  with different web build IDs and document identities and identical native
  executable/DLL/data hashes. This complements 005's safe-cache/reachability
  evidence. It does not qualify the suspended production host or the Release
  package's cache lifecycle. See the
  [reproduction guide](../docs/website-update-acceptance.md).
- Apple builds need a macOS/Xcode host, secured signing/provisioning and native
  online/offline/appearance checks. The current Linux app explicitly reports an
  unavailable embedded browser; implement and qualify that adapter before
  attempting a usable shell release. Flutter's Linux runner alone is insufficient.

Current commands, artifacts and signing requirements are in
[the release guide](../docs/releases.md),
[Windows bundle/install instructions](../docs/windows-release.md),
[Android signing](../docs/android-release.md) and
[independent website-update acceptance](../docs/website-update-acceptance.md).
Windows [account/offline isolation](../docs/offline-identity-acceptance.md) and
[native UI checks](../docs/windows-ui-acceptance.md) have separate reproduction
guides; their successful and incomplete subchecks remain explicitly scoped above.
The retained production origin returns HTTP 403 / Account Suspended. Restore
that deployment before retrying production launch, production cache preparation
or a representative real deployed website update. No published release or
five-platform support claim is made.

## Handoff

Run meaningful automated checks for shared logic and manual installed-build checks for native behavior; include the Next.js checks affected by shared offline changes. Update [the Flutter README](../README.md) and [the tracker](../dev-tracker.md) with reproducible commands, artifacts, actual results, remaining limitations, and release details only for releases actually performed. Keep the step Partial while required acceptance work remains; never infer success from plan text or generated build files.
