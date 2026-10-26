# Native name and launcher artwork

The installed display name is **Goal Hint**. Native icons are generated from
[the existing primary brand mark](../../next-js/public/brand/goal-hint-mark-primary.svg),
preserving its cyan mark, navy football, proportions, and clear space. Android
and iOS launcher formats use white; macOS, Windows, and Linux use transparency. The
previous navy tile is removed. There is no separately designed Flutter logo or
rounded container.

From the repository root, with the existing Next.js dependencies installed:

```sh
node flutter/tool/generate-icons.mjs
```

The generator uses the web project's pinned Sharp dependency and requires no
additional Flutter runtime package. It produces:

- Android density-specific legacy icons, transparent adaptive foregrounds with
  the mark within the 66dp safe zone of the 108dp layer, and monochrome layers.
  API 26 uses foreground/background; API 33 adds the themed monochrome icon.
  Android chooses its launcher mask. The label comes from `@string/app_name`.
  See [Android's adaptive-icon requirements](https://developer.android.com/develop/ui/compose/system/icon_design_adaptive).
- White opaque iOS icons and transparent macOS icons at every size declared by
  their existing asset catalogs. macOS product, scheme, and test-host paths
  use `Goal Hint.app`.
- A Windows ICO containing 16, 24, 32, 48, 64, 128, and 256 pixel PNG images,
  with a transparent background, plus the Goal Hint window title and public
  product/file description.
- A Linux icon installed with the relocatable bundle, a matching desktop entry,
  and Goal Hint GTK application/window names. The runner loads its bundled icon.

Existing package/bundle/application IDs and technical executable names remain
unchanged. This lets the updated Android app retain the installed browser profile
and avoids creating another app. The generated artwork is committed; the Next.js
SVG stays the canonical input for future brand updates.

The owner selected a **white launch/loading screen**, including when the device
uses dark mode. Android 12+ has explicit day/night splash background, icon, and
branding-image resources. The Flutter startup view continues with the mark,
Goal Hint name, and animated loading indicator until the first trusted document
finishes. It preserves the mounted browser; later navigation uses a small
progress indicator. Reduced-motion settings retain loading text without the
animation. Product screens still follow the website's chosen theme.

See [the tracker](../dev-tracker.md) for installed Android and Windows evidence.
Apple/Linux asset and metadata updates do not qualify their native execution on
this Windows host. Complete system-bar and light/dark
appearance, store identity, and release signing remain in
[006](../dev-plan/006-app-identity-and-theme.md) and
[007](../dev-plan/007-platform-builds-and-release.md).
