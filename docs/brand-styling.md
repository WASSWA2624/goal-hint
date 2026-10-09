# Shared brand styling

Prompt [015](../dev-plan/015-brand-styling.md) provides the light-theme styling
foundation. It uses the existing [brand kit](../assets/brand/README.md), Manrope
source font and named first-party assets. Public routes continue to show the
honest development state until their later implementation prompts.

## Theme and rendering

`src/styles/theme.ts` exports `lightTheme`, `GoalHintTheme` and `OutcomeTone`.
Semantic colors, typography, spacing, breakpoints, borders, focus and control
dimensions share one contract. A later theme can implement that contract; only
the light theme is active. Brand teal remains separate from outcome colors:
Correct is green, Incorrect is red, and Pending, Void and Unavailable are gray.

The server root layout wraps its children in one `StyleProvider`. Its Client
Component registry creates a `ServerStyleSheet` per instance, inserts collected
rules through `useServerInsertedHTML`, and clears each emitted tag. The browser
uses the existing sheet through styled-components hydration. A single
`ThemeProvider` supplies the tokens and a single `GlobalStyle` supplies the
reset. Nested route layouts must reuse this arrangement rather than mount
another provider or registry. Do not seal the sheet while a response streams.

`compiler.styledComponents` provides stable component identities. Styled
definitions remain at module scope in Client Component files; pages and layouts
retain their Server Component boundary. Use transient props for styling, such
as `$gap`, instead of sending styling fields to native elements. The ESLint
private-import boundary also covers `src/styles`.

The existing licensed Manrope variable font is loaded with `next/font/local`;
no font-service request is required. Its [SIL Open Font License](../assets/brand/source/fonts/OFL.txt)
remains alongside the source. Typography uses rem units with a 16px default.
Spacing and the page gutter use fixed pixel tokens so enlarging text leaves
usable content width. Controls have a 2.75rem minimum height (44px at default
text size). Components have square corners.

## Reusable exports

Import directly from the owning module to keep dependencies clear:

| Module | Exports and use |
| --- | --- |
| `@/styles/provider` | `StyleProvider`, used once by the root layout. |
| `@/styles/theme` | `lightTheme`, `GoalHintTheme`, `OutcomeTone`. |
| `@/components/ui/brand` | `BrandLogo`, `BrandMark`, `BrandImageProps`. Named primary, inverse and monochrome variants with reserved dimensions and clear space. |
| `@/components/ui/layout` | `Container`, `Stack`, `Inline`, `Surface`, `PageMain`, `PageHeading`, `SectionHeading`, `BodyText`, `MutedText`. Logical spacing, wrapping and bounded content width. |
| `@/components/ui/controls` | `Button`, `ButtonLink`, `TextLink`, `TextInput`, `SelectInput` and their prop types. Native button, Next.js link and labeled native form semantics. |
| `@/components/ui/feedback` | `StatusText`, `EmptyState` and their prop types. Explicit text and decorative outcome icons; empty states accept a heading, explanation and optional action. |
| `@/components/ui/visually-hidden` | `VisuallyHidden`: reusable accessible-only text, including polymorphic headings and score labels. |

Prompt 018 composes these primitives into the shared
[match-card components and responsive list](match-card.md). Reuse their
selected-market, outcome and remote-image contracts on later public pages.

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

`BrandLogo` displays the 553:128 SVG at 176px wide with 12px clear space on all
sides; `BrandMark` displays a 32px mark with 8px clear space. Use `alt=""` when
nearby text already names the brand, and an accessible “Goal Hint home” name
for a logo-only home link. Inverse assets require a compatible navy surface.
The primitives load first-party branding only. Later football images must
remain direct approved remote URLs.

## Contrast and motion

White text on brand teal has a 4.86:1 contrast ratio. Navy text on white is
16.69:1; muted text on white is 5.98:1. Outcome text on its own background is
at least 6.10:1. Input and secondary-button boundaries use the stronger
`controlBorder` token (3.54:1 on white and 3.32:1 on paper); the lighter brand
border is reserved for decorative divisions. Focus uses a 3px navy outline
with a 3px offset. Windows display scaling may return fractional computed
outline widths. Reduced-motion preference removes meaningful animation and
transition duration. No motion is needed to understand the interface.

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
