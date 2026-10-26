# 007 - Platform builds and release acceptance

**State: Not started.** Prerequisites: [001](001-foundation-and-platform-support.md), [002](002-environment-urls.md), [003](003-web-app-integration.md), [004](004-persistent-offline-startup.md), [005](005-reconnection-and-cache-updates.md), and [006](006-app-identity-and-theme.md). Follow [the specification](../../app-write-up.md) and [the shell requirements](../../prompts/flutter-app-shell.md).

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
| Build, install, online production launch | Not tested | Not tested | Not tested | Not tested | Not tested |
| Development URL from emulator/device or desktop | Not tested | Not tested | Not tested | Not tested | Not tested |
| Navigation, back/external links, account lifecycle | Not tested | Not tested | Not tested | Not tested | Not tested |
| Icon, splash, light/dark theme, resizing/input/accessibility | Not tested | Not tested | Not tested | Not tested | Not tested |
| First launch offline without an existing cache | Not tested | Not tested | Not tested | Not tested | Not tested |
| Online warmup then terminated-app offline cold start | Not tested | Not tested | Not tested | Not tested | Not tested |
| Uncached route and unavailable server-dependent action | Not tested | Not tested | Not tested | Not tested | Not tested |
| Logout/account isolation then offline reopen | Not tested | Not tested | Not tested | Not tested | Not tested |
| Reachability recovery and safe website-only update | Not tested | Not tested | Not tested | Not tested | Not tested |
| Interrupted/failed update retains last working version | Not tested | Not tested | Not tested | Not tested | Not tested |
| Cache eviction/corruption and recovery | Not tested | Not tested | Not tested | Not tested | Not tested |

## Handoff

Run meaningful automated checks for shared logic and manual installed-build checks for native behavior; include the Next.js checks affected by shared offline changes. Update [the Flutter README](../README.md) and [the tracker](../dev-tracker.md) with reproducible commands, artifacts, actual results, remaining limitations, and release details only for releases actually performed. Keep the step Partial while required acceptance work remains; never infer success from plan text or generated build files.
