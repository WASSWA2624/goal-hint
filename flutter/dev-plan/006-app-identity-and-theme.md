# 006 - Installed identity and native appearance

**State: Not started.** Prerequisite: [003](003-web-app-integration.md). Follow [the specification](../../app-write-up.md), [the shell requirements](../../prompts/flutter-app-shell.md), and [the existing brand guide](../../next-js/assets/brand/README.md).

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
