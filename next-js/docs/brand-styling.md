# Shared brand styling

Prompt [015](../dev-plan/015-brand-styling.md) provides the light-theme styling
foundation. It uses the existing [brand kit](../assets/brand/README.md), Manrope
source font and named first-party assets. Public routes continue to show the
honest development state until their later implementation prompts.

## Theme and rendering

`src/styles/theme.ts` exports `lightTheme`, `darkTheme`, `GoalHintTheme` and `OutcomeTone`.
Semantic colors, typography, spacing, breakpoints, borders, focus and control
dimensions share one contract, including a light/dark mode for native controls.
Light mode uses a white page, white content surfaces and white header/navigation
chrome with dark text. Dark mode uses navy page, content and header surfaces
with light text. Muted surfaces, fields, menus, dialogs, tables, match cards and
slip cards all resolve colors from the active theme. `theme.phoneCardFrame`
provides the shared square, shadow-free match/slip frame with a themed border;
phone cards do not force the light palette when dark mode is selected.
Brand teal remains separate from outcome
colors: Win is green, Loss is red, Pending is amber, and Void/Unavailable are
neutral. Light-mode verdict tags retain vivid fills and dark text; dark-mode
tags use dark tinted fills with readable light semantic text. Explicit result
labels preserve their meaning without depending on color.

The server root layout wraps its children in one `StyleProvider`. Its Client
Component registry creates a `ServerStyleSheet` per instance, inserts collected
rules through `useServerInsertedHTML`, and clears each emitted tag. The browser
uses the existing sheet through styled-components hydration. A single
`ThemeProvider` supplies the tokens and a single `GlobalStyle` supplies the
reset. `useSyncExternalStore` keeps server rendering and initial hydration on a
stable light snapshot, then reads the saved browser preference or system color
scheme. The shared title-bar `ThemeToggle` switches the mode and persists only
that local preference under `goal-hint-theme`; blocked storage retains a working
in-memory choice. Changes synchronize between tabs and system preference changes
apply when no explicit choice is saved. Nested route layouts must reuse this arrangement rather than mount
another provider or registry. Do not seal the sheet while a response streams.

### Public native appearance metadata

The website remains the only owner of theme selection and the
`goal-hint-theme` preference. `StyleProvider` publishes
`meta[name="goal-hint-appearance"]` only after its client snapshot resolves;
the server snapshot is `null` for metadata while server-rendered styling stays
light. This prevents an initial server-light value from replacing a restored
dark preference in the native shell. The same resolved render updates the
standard `color-scheme` and `theme-color` metadata.

The version-1 JSON contains exactly seven public fields:

| Field | Shared theme source |
| --- | --- |
| `version` | Integer `1` |
| `scheme` | `theme.mode`: `light` or `dark` |
| `background` | `theme.color.page` |
| `surface` | `theme.color.surface` |
| `foreground` | `theme.color.text` |
| `accent` | `theme.color.brand` |
| `chrome` | Solid `theme.header.background`; also used by `theme-color` |

Colors are opaque six-digit hex values. No account state, credentials, route
data or native preference is included. The Flutter host reads this bounded
metadata through a fixed trusted-top-document query, with one serialized
foreground sample after each one-second interval and an immediate read after
load/resume. It does not make a network request or expose a page-callable native
bridge. See [the native integration contract](../../flutter/docs/web-app-integration.md#web-controlled-native-appearance)
for lifecycle, startup and platform limits. Normal web-theme changes continue
to ship from this shared provider.

`compiler.styledComponents` provides stable component identities. Styled
definitions remain at module scope in Client Component files; pages and layouts
retain their Server Component boundary. Use transient props for styling, such
as `$gap`, instead of sending styling fields to native elements. The ESLint
private-import boundary also covers `src/styles`.

The existing licensed Manrope variable font is loaded with `next/font/local`;
no font-service request is required. Pages preload
`assets/brand/source/fonts/Manrope-wght-latin.woff2` (36,636 bytes), a Latin
WOFF2 subset of the unmodified 164,700-byte `Manrope-wght.ttf`. It keeps the
variable `wght` axis (200–800), every OpenType layout feature and Basic Latin,
Latin-1, Latin Extended-A/B and Additional, IPA modifiers, combining marks,
punctuation, currency, letterlike and arrow symbols. Characters outside it,
such as Cyrillic or Greek team names, use the Arial fallback. Regenerate it
from the TTF with fontTools and brotli:
`pyftsubset Manrope-wght.ttf --flavor=woff2 --layout-features='*' --name-IDs='*' --name-languages='*' --unicodes="U+0000-024F,U+0259,U+02B0-02FF,U+0300-036F,U+1E00-1EFF,U+2000-206F,U+20A0-20CF,U+2100-214F,U+2190-21FF,U+2212,U+2215,U+FEFF,U+FFFD" --output-file=Manrope-wght-latin.woff2`.
Its [SIL Open Font License](../assets/brand/source/fonts/OFL.txt) remains
alongside the source and covers the subset, which keeps the license name records. Typography uses rem units with a 16px default.
Spacing and the page gutter use fixed pixel tokens so enlarging text leaves
usable content width. Controls have a 2.75rem (44px) minimum height from 64rem;
phones and tablets use the 2.25rem (36px) compact height.

Use `theme.border.radius` for the shared subtle 2px corner radius, sourced from
`shape.componentRadius` in `assets/brand/brand-tokens.json`. Apply it consistently
to fields, buttons, menus, dialogs and standalone panels on every screen size.
Keep joined control edges, tables and dense row structures square where they
meet. Preserve functional circular or pill shapes and the logo's artwork geometry.

Keep passive frames quiet with `theme.color.border`: neutral `#D7DFE7` in light
mode and `#203448` in dark mode. Use it for section and card outlines, dialog
frames, menu containers and dividers. Editable fields and outlined controls use
`theme.color.controlBorder` (`#7D8997` light, `#597895` dark) so they remain easy
to recognize. Preserve existing border widths, dimensions and layout; focus,
selection, validation and outcome indicators retain their meaningful colors.

## Reusable exports

Import directly from the owning module to keep dependencies clear:

| Module | Exports and use |
| --- | --- |
| `@/styles/provider` | `StyleProvider`, used once by the root layout. |
| `@/styles/theme` | `lightTheme`, `darkTheme`, `GoalHintTheme`, `OutcomeTone`, and static `media` query strings. |
| `@/components/ui/theme-toggle` | `ThemeToggle`: shared accessible title-bar button with a visible icon, action label, pressed state and focus ring. |
| `@/components/ui/brand` | `BrandLogo`, `BrandMark`, `BrandImageProps`. Adaptive by default: primary artwork in light mode and inverse artwork in dark mode. Explicit primary, inverse and monochrome variants remain available, with reserved dimensions and clear space. |
| `@/components/ui/layout` | `Container`, `Stack`, `Inline`, `Surface`, `PageMain`, `PageHeading`, `SectionHeading`, `BodyText`, `MutedText`. Logical spacing, wrapping and bounded content width. |
| `@/components/ui/controls` | `Button`, `ButtonLink`, `TextLink`, `TextInput`, `SelectInput` and their prop types. Native button, Next.js link and labeled native form semantics. |
| `@/components/ui/feedback` | `StatusText`, `EmptyState` and their prop types. Explicit text and decorative outcome icons; empty states accept a heading, explanation and optional action. |
| `@/components/ui/visually-hidden` | `VisuallyHidden`: reusable accessible-only text, including polymorphic headings and score labels. |

Prompt 018 composes these primitives into the shared
[match-card components and responsive list](match-card.md). Reuse their
selected-market, outcome and remote-image contracts on later public pages.

The primitives are mobile first. Base rules use the compact `typography.scale`
and the 2.25rem (36px) `control.compactHeight` on phones and tablets; the full
`typography.size` values, 24px surface padding and the 2.75rem (44px) control
minimum apply from 64rem. Page and section headings are 18/16px on phones,
22/18px from 48rem and 32/24px on desktop. Below desktop, `Stack` gaps are
8/12/16/24px, `Inline` uses 6px by 12px, `Surface` pads 12px (16px from 48rem),
muted notes, field hints and outcome chips are 12px, and text links keep a 2rem
target. Content-page `section[id]` anchors clear the sticky header. Hover styles
apply only under `media.hover`; prefer the static `media` strings over
theme-function breakpoints in list components.

`Button` defaults to `type="button"`; use `type="submit"` deliberately inside
forms. Variants are `primary`, `secondary` and `quiet`. Native disabled buttons
and inputs retain their normal keyboard behavior. `ButtonLink` is navigation
and does not pretend to be a disabled button.

Inputs require `label`, accept native attributes and refs, and generate an ID
when none is supplied. `hint` and `error` are associated through
`aria-describedby`; supplied description IDs are preserved. An error sets
`aria-invalid` and adds readable text. Provide unique explicit IDs when setting
them yourself. Native selects retain keyboard and platform behavior.

`StatusText` requires a `tone` and explicit text children. Its decorative icon
does not repeat the label to assistive technology. `announce` enables an atomic,
polite status region for a meaningful changing message; leave it off for static
outcome lists. `EmptyState` defaults to a level-two heading and accepts
`headingLevel` to fit the page hierarchy. It does not invent a data-state claim.

The logo pairs a heavy open G (a thick filled ring with a square crossbar) and
a solid football inside it with a Manrope ExtraBold (800) wordmark; see the
[brand kit](../assets/brand/README.md) for the artwork and its regeneration.
`BrandLogo` displays the 553:128 SVG at 176px wide with 12px clear space on all
sides. Below 64rem the content-page header and the feed's brand bar show it at
the 160px brand minimum with no extra padding, on the 16px page gutter; the
3.25rem (52px) `theme.header.phoneHeight` bar leaves about 7.5px above and
below, and the artwork adds about 3.5px of its own margin, which together
exceed a quarter of the displayed mark. `BrandMark` displays a 32px mark with
8px clear space and loads lazily, so the footer mark is not preloaded; the
header logo stays eager. Its inverse SVG is embedded as a data URI generated
from the same artwork by `scripts/generate-brand.py`, eliminating a separate
image request for the measured LCP element without changing its appearance.
Use `alt=""` when
nearby text already names the brand, and an accessible “Goal Hint home” name
for a logo-only home link. Shell, feed, match-detail and footer branding use the
adaptive default so the primary artwork appears on light chrome and inverse
artwork appears on dark chrome. An explicit inverse variant requires a
compatible dark surface. `gradient.tableHeader` follows the active theme and
is reserved for table headings.
The primitives load first-party branding only. Approved API-Sports football
badges use the shared bounded badge cache; other approved image hosts
remain direct browser requests.

## Contrast and motion

Body, caption, link and outcome text keep at least 4.5:1 contrast against their
intended surfaces. Input and secondary-button boundaries use the stronger
`controlBorder` token, which keeps at least 3:1 contrast against the main page,
surface and muted-surface colors in both themes. The quieter `border` token is
reserved for passive frames and divisions. On light surfaces focus uses the
3px blue `theme.color.focus` outline with a 3px offset; dark surfaces use the
same token's cyan value. Header bars use the active theme's 3px
`theme.header.accent` ring: drawn 4px inside
the desktop nav links and 6px inside the desktop logo link so the sticky bar
never clips it, and 2px outside the phone bars' logo, back and round buttons.
The skip link uses the theme's focus ring inside its surface and adds a 3px
header-accent halo, so it reads over the bar and the page alike. Windows
display scaling may return fractional computed outline widths. Reduced-motion
preference removes meaningful animation and transition duration. No motion is
needed to understand the interface.

`theme.header` holds the tokens shared by the desktop shell header and every
phone top bar (content pages, the feed's brand bar and match details). They
include a white background and dark text in light mode, navy background and
light text in dark mode, `mutedText` for resting links, search `placeholder`,
`accent` and its contrasting `onAccent`, control and field fills, section-icon
`tone` colors and a 3.25rem `phoneHeight`. Bottom navigation and table headings
follow the same selected mode. Menus and sheets use semantic surfaces,
`theme.color.scrim` for the backdrop and `theme.shadow.popover` for elevation.
Use `theme.header.border` for passive separators and
`theme.header.controlBorder` for actual control boundaries (`#7D8997` light,
`#6785A1` dark). Keep focus and active-navigation accents distinct from these
quiet frames. New small text on the bar must keep 4.5:1 contrast on every
background stop and relevant control fill.

## Development and acceptance

Since prompt 016, the public homepage opens the locale navigation shell in
development and production. The component preview is no longer mounted there.
Use the isolated styling fixture below to inspect primitives without adding
demonstration controls to the public application.

Run the pinned Node.js and npm versions from `package.json`:

```text
npm run check
npm run test:styling
```

`test:styling` builds an isolated production Next.js fixture under `.tmp` using
the actual root layout, registry and primitives. It checks initial CSS before
content, singleton global styles, genuine delayed styles before their streamed
DOM, unique registered rules, field associations, transient props and a fake
server-secret canary excluded from HTML and browser JavaScript. The fixture
contains synthetic interface copy only. It copies first-party branding and
makes no football, AI or database requests.

For browser checks, `npm run test:styling -- --serve` prints a localhost URL and
keeps the fixture server open. Ctrl+C stops it. Inspect 320, 360, 390, 430px and
desktop widths, double the base text size, exercise Tab/Shift+Tab and native
fields, and navigate between the primitive and delayed routes repeatedly.
Check focus, labels, disabled controls, long text, outcome icons, reduced
motion, initial rendering without JavaScript and the console. Keep screenshots
and traces under ignored `output/playwright/`.

The production fixture verifies the shared streaming arrangement without adding
synthetic routes to the application. Separately inspect the actual production
homepage and browser chunks for the absence of the development preview.

## Implementation references

The registry follows the [Next.js App Router CSS-in-JS guide](https://nextjs.org/docs/app/guides/css-in-js)
and the installed Next.js 16.4 documentation. The components use
[styled-components theming and server rendering](https://styled-components.com/docs/advanced)
and [transient props](https://styled-components.com/docs/api#transient-props).
Font delivery uses [Next.js local fonts](https://nextjs.org/docs/app/api-reference/components/font#local-fonts).

Feed and slip surfaces follow the selected mode throughout: white in light
mode and dark navy in dark mode, with muted themed regions and clear control
and selection states. Phone match/slip cards and connected table/row edges
remain square. Market panels, glyphs and result tags retain semantic colors
with foregrounds and fills paired for the active theme.
