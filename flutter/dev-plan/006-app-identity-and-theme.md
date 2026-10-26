# 006 - Installed identity and native appearance

**State: Partial — shared identity and web-driven native appearance implemented; Windows window identity, white loading, real OS fallback changes, and web-theme reload/restart checks passed. Further Android checks are deferred; Apple/Linux execution and installed launcher/packaging qualification remain open.** Prerequisite: [003](003-web-app-integration.md). Follow [the specification](../../app-write-up.md), [the shell requirements](../../prompts/flutter-app-shell.md), and [the existing brand guide](../../next-js/assets/brand/README.md).

## Outcome

Make installed builds look like Goal Hint while preserving the website as the source of interface styling and theme preference.

## Work

- Set the display name consistently to Goal Hint. Reuse the existing brand sources in `next-js/assets/brand/` and exported artwork in `next-js/public/brand/`; retain proportions, clear space, colors, and appropriate light/dark variants.
- Generate or configure platform-required icon sizes, formats, launcher/adaptive variants, splash resources, and desktop identity assets. Keep reusable inputs or a documented generation command so brand updates do not require hand-editing every platform asset.
- Verify actual platform masking, safe zones, transparency, and display requirements when implementing. Use native-required shapes where inevitable; do not add rounded containers or restyle the web interface.
- Match launch surfaces, system bars, and any necessary native error/loading surfaces to the web app's appearance. Reuse the established web theme preference and system fallback, with only the minimum trusted integration required; avoid a competing Flutter theme setting or duplicate component design system.
- Separate public identity metadata from signing material. Choose stable application identifiers for actual builds and document their use without adding credentials to source control.

## Acceptance and handoff

- Inspect installed launcher/taskbar/dock identity and cold-start splash/loading transitions on each available target in light and dark appearance.
- Change theme through the existing website and verify the shell stays consistent through reload and restart without overriding the user's setting.
- Confirm generated artwork matches the shared brand and record generation steps, platform screenshots/checks, identity settings, and remaining gaps in [the tracker](../dev-tracker.md) for [007](007-platform-builds-and-release.md).

## Display name and launcher correction

The owner requested replacing the visible `goal_hint` name and Flutter logo.
Names and launcher assets now use Goal Hint across the native projects, generated
from the existing shared artwork. Android includes legacy, adaptive, and themed
monochrome resources. Existing application identifiers are preserved for installed
updates. See [the identity guide](../docs/app-identity.md) for generation and
platform details; the tracker records actual device/build checks. Primary-mark
colors and clear space are retained; Android/iOS use white and macOS/Windows/Linux
use transparency. Android's dark-OS white startup has been visually checked,
and the duplicate bottom inset was corrected in the native Android host while
preserving shared web/iOS safe-area behavior. The subsequent Flutter logo/name/
spinner transition was visually captured on the installed Android build. These
are prior Android results; the owner explicitly deferred further Android checks
for this step. Existing IDs are preserved for updates; store identity/signing
finalization remains open.

## Current implementation and acceptance — 26 October 2026

The website remains the owner of its saved theme preference and system fallback.
It publishes only versioned public appearance metadata. Native adapters read
that bounded metadata for trusted documents and apply its colors to native
feedback, system-bar integration and desktop decorations. No web-callable native
channel, native theme preference, page reload or duplicate product UI was added.
The branded launch surface stays white in both OS appearances. The
[identity guide](../docs/app-identity.md) records the contract, generation command,
public identifiers and signing boundary.

Windows 11 x64/WebView2 (actual document UA Chrome/Edge 155) passed two separate
processes with the same origin and retained profile. Actual Windows Settings
changes from dark to light produced matching web CSS, public metadata and all
native colors while no explicit web preference was stored. The existing website
theme button then selected light/dark; dark survived a real document reload and
a complete process restart while Windows remained light. White startup was
visually checked in both OS appearances. Window name/icon and the dark native
caption beside the dark web page were inspected; this is not an installed or
pinned taskbar/shortcut/dock qualification.

The normal Windows Debug entry point was restored. The harness cleaned only its
fixture-origin theme key, and the operator restored the original OS appearance.
Startup duration was deliberately gated for inspection, so it is not a launch
performance measurement. See [the tracker](../dev-tracker.md) for measured
commands, checks and artifact scope, and
[the two-process reproduction flow](../integration_test/README.md#installed-identity-and-appearance).

006 remains Partial for Android's deferred current-source system-bar/appearance
checks, Apple compilation/runtime, Linux embedding, and installed identity
qualification handed to [007](007-platform-builds-and-release.md). Source artwork
audits do not replace platform masking or installed-runtime evidence.
