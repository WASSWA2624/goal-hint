# Native name and launcher artwork

The installed display name is **Goal Hint**. Native artwork reuses the
[primary mark](../../next-js/public/brand/goal-hint-mark-primary.svg) and
[small-size mark](../../next-js/public/brand/goal-hint-favicon.svg), preserving the
shared colors, proportions and clear space. Android/iOS launcher formats use
white; desktop artwork has a transparent exterior. No Flutter starter artwork,
dark tile or separately rounded container is added. The OS applies its own mask.

From the repository root, with the existing Next.js dependencies installed:

```sh
node flutter/tool/generate-icons.mjs
node flutter/tool/generate-icons.mjs --check
```

The [generator](../tool/generate-icons.mjs) uses the web project's pinned Sharp
dependency and needs no additional Flutter runtime package. `--check` compares
all 45 outputs without writing; it fails on missing/stale files. Catalog sizes
and Android's circular 66dp safe zone are validated during generation. It supplies:

- Android density-specific legacy icons, transparent adaptive foregrounds with
  the mark within the 66dp safe zone of the 108dp layer, and monochrome layers.
  API 26 uses foreground/background; API 33 adds the themed monochrome icon.
  Android chooses its launcher mask. The label comes from `@string/app_name`.
  See [Android's adaptive-icon requirements](https://developer.android.com/develop/ui/compose/system/icon_design_adaptive).
- White opaque iOS icons and transparent macOS icons at the declared catalog
  sizes. macOS 16/32px images use the shared small-size mark, whose opaque white
  football remains legible on either appearance. macOS product/scheme/test-host
  paths use `Goal Hint.app`.
- A Windows ICO with 16, 20, 24, 32, 40, 48, 64, 128 and 256px images. All frames
  use that existing opaque-football variant for contrast on both desktop
  appearances, fitted uniformly to about 90% of the frame instead of the
  mobile launcher's padded canvas. The exterior stays transparent. Window
  title and public product/file descriptions use Goal Hint.
- A Linux icon installed with the relocatable bundle, a matching desktop entry,
  and Goal Hint GTK application/window names. Its initial rendering surface is
  white; the runner loads the bundled icon.
- iOS 96-point launch artwork at 1x/2x/3x, replacing the template's transparent
  placeholders. The storyboard displays the mark and Goal Hint name on white;
  Flutter supplies the loading animation after its first frame.

## Public identity and signing

| Platform | Public identity used by this project |
| --- | --- |
| Android | Application ID/namespace `com.goalhint.goal_hint`; display label from `@string/app_name`. |
| iOS | Bundle ID `com.goalhint.goalHint`; display name Goal Hint. |
| macOS | Bundle ID `com.goalhint.goalHint`; product Goal Hint. |
| Windows | Explicit AppUserModelID `com.goalhint.goal_hint`; technical executable `goal_hint.exe`. |
| Linux | GTK/desktop ID `com.goalhint.goal_hint`; technical executable `goal_hint`. |

Existing package/bundle IDs and executable/profile locations are preserved.
Windows sets its explicit taskbar ID before presenting UI. The runner itself
does not modify user pins, shortcuts or the icon cache. The
[007 per-user installer](windows-release.md) creates Goal Hint shortcuts pointing
at the bundled executable and its icon, preserves unrelated shortcuts and removes
only its managed shortcuts during uninstall. Store registration, signed packaging
and actual pinned-taskbar qualification remain open.

These names/IDs are public metadata, not signing credentials or proof of store
registration. Android Release builds now require explicit
[secured release signing](android-release.md); they never fall back to debug
keys. Earlier locally debug-signed validation artifacts do not qualify a current
release. Store keystores/passwords, Apple certificates/provisioning/team access
and Windows signing keys must stay out of Git. See the
[build and release guide](releases.md) for available artifacts and the remaining
signing/publication gates.

## Launch and shared appearance

The owner selected a **white launch/loading screen**, including when the device
uses dark mode. Android 12+ has explicit day/night splash background, icon, and
branding-image resources. The Flutter startup view continues with the mark,
Goal Hint name, and animated loading indicator until the first trusted document
finishes. It preserves the mounted browser; later navigation uses a small
progress indicator. Reduced-motion settings retain loading text without the
animation. Product screens still follow the website's chosen theme.

Android retains an explicitly light/white `LaunchTheme` in day and night.
`NormalTheme` inherits a day/night `NormalThemeBase`: the night parent is the
standard dark Android theme, so WebView receives the correct OS
`prefers-color-scheme` fallback. Both bases keep a white initial window/status
surface with dark status icons. API 26+ adds white navigation/dark navigation
icons; older navigation keeps its platform default. This does not enable Force
Dark or invert website colors. See [Android's WebView theme contract](https://developer.android.com/develop/ui/views/layout/webapps/dark-theme).

The existing web preference remains authoritative. The shared web provider emits
`meta[name="goal-hint-appearance"]` with version, resolved light/dark scheme and
five public colors: background, surface, foreground, accent and chrome. The host
uses one fixed read-only query on the configured exact origin's top-level
document, at most one foreground read at a time on a one-second cadence. It
accepts only the bounded seven-field schema and six-digit RGB colors; account
state, arbitrary fields and commands are excluded. Navigation/suspension/disposal
stop sampling and stale replies cannot replace newer document appearance.

Flutter uses those colors for necessary native loading/error surfaces and system
bars. Windows maps the public scheme/colors to DWM caption decoration; macOS has
the corresponding native NSAppearance/color handler. The native method channel
is Flutter-to-platform presentation only: generic page-to-native JavaScript IPC
remains disabled. The host stores no native preference, copies no web components
and never writes local storage or reloads a page to synchronize appearance.

Native integration/resource changes require a new Flutter build. Normal product
screens, theme preference and public web palette updates continue to ship through
Next.js using this contract, without rebuilding the shell.

## Verification and handoff

The asset audit passed `--check` for 45 outputs plus 56 catalog/frame metadata
checks covering dimensions, alpha, ICO frames and monochrome layers. Native
XML/plist parsing and Android resource-resolution checks passed. Source checks
do not establish installed Apple/Linux masking or launch behavior.

Step 006's Windows 11/WebView2 (UA 155) acceptance passed white branded startup under both
real OS dark and light appearances. Automatic dark-to-light fallback matched the
shared CSS/metadata and all five native colors without storing a web preference.
The actual website Light/Dark controls persisted their selections through reload;
a separate process using the same profile retained Dark while the OS was Light,
including the dark native caption. The window name and icon were visually
correct. That run did not qualify taskbar pins, installer shortcuts or dock identity.
The subsequent [007 follow-up](../dev-tracker.md) separately verifies the installed
Windows shortcuts and pinned taskbar icon, including its larger Windows-only fit
and opaque football for contrast across desktop backgrounds.

All 42 Flutter tests and the analyzer passed. The normal `main.dart` Debug build
was restored successfully. Test cleanup removed only the fixture-origin theme
key and restored the original Windows appearance settings. Ignored captures are
under `next-js/output/identity-006/`; [the tracker](../dev-tracker.md) records the
individual checks and remaining acceptance work.

Further Android device checks are explicitly deferred by the owner. Apple native
compilation/runtime, macOS decoration execution and Linux embedding/appearance
remain unqualified on this Windows host. These platform gaps keep
[006](../dev-plan/006-app-identity-and-theme.md) Partial.
The tracker retains prior
Android observations separately; they do not qualify the new theme changes.
