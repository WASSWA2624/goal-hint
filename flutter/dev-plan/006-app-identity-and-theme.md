# 006 - Installed identity and native appearance

**State: Partial — Goal Hint names, shared-primary-mark launcher assets, and white launch/loading surfaces implemented at the owner's request. Android's OS splash, Flutter logo/name/spinner transition and compact bottom inset are verified; full platform appearance acceptance remains open.** Prerequisite: [003](003-web-app-integration.md). Follow [the specification](../../app-write-up.md), [the shell requirements](../../prompts/flutter-app-shell.md), and [the existing brand guide](../../next-js/assets/brand/README.md).

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
spinner transition was visually captured on the installed Android build. Complete
system-bar/theme/restart behavior, installed masking, other native launch
transitions, and Apple/Linux execution remain unqualified. Existing IDs are preserved for updates;
store identity/signing finalization is still open.
