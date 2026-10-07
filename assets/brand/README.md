# Goal Hint brand kit

The selected identity combines a minimal football with an open geometric **G**, deep navy and teal. The Manrope wordmark is converted to vector outlines, so exported artwork renders without an installed font.

**Tagline:** Football predictions. Clearly explained.

Open [the standalone preview](goal-hint-brand-preview.html) or [the contact sheet](goal-hint-brand-sheet.png) to review the complete kit. Production files live in [`public/brand`](../../public/brand); [the manifest](asset-manifest.json) lists every export.

## Usage

| Asset | Dimensions: SVG / PNG | Use |
| --- | --- | --- |
| `goal-hint-logo-primary` | 553 × 128 / 1106 × 256 | Default horizontal logo on white or paper. |
| `goal-hint-logo-inverse` | 553 × 128 / 1106 × 256 | Teal and white horizontal logo on navy. |
| `goal-hint-logo-monochrome`, `goal-hint-logo-monochrome-inverse` | 553 × 128 / 1106 × 256 | Single-color navy or white reproduction. |
| `goal-hint-mark-primary`, `-inverse`, `-monochrome`, `-monochrome-inverse` | 160 × 160 / 640 × 640 | Standalone full-detail symbols. |
| `goal-hint-favicon` | SVG: 160 × 160; ICO: 16, 32 and 48 px | Simplified micro mark for browser tabs. Separate PNGs are named `goal-hint-favicon-16`, `-32` and `-48`. |
| `goal-hint-apple-touch-icon` | 180 × 180 / 180 × 180 | Apple touch icon. |
| `goal-hint-app-icon-192`, `goal-hint-app-icon-512` | 192 × 192 and 512 × 512 | Prepared square icon exports; these do not enable a PWA. |
| `goal-hint-social-avatar` | 512 × 512 / 512 × 512 | Profile/avatar image. |
| `goal-hint-open-graph` | 1200 × 630 / 1200 × 630 | Shared-link and social preview; use PNG for metadata. |
| `goal-hint-brand-tokens.css`, `.json` | — | Reusable palette, typography and shape values. |

Use SVG for interface logos and PNG where vector files are unsupported. Keep aspect ratios unchanged. Leave clear space on every side equal to **one quarter of the displayed mark width**, including around a horizontal logo. Minimum display widths are **160 px for the primary horizontal logo** and **32 px for the full mark**; use the micro favicon at **16–32 px**.

Do not stretch, recolor, add shadows or place artwork in rounded containers. Components use square corners (`0px` radius). The circular football is part of the identity, not a UI corner treatment.

## Palette and accessibility

| Token | Value | Role |
| --- | --- | --- |
| Navy | `#0B1F33` | Wordmark, primary text and dark surfaces. |
| Teal | `#007F7A` | Brand/navigation accent on light surfaces. |
| Inverse teal | `#39D5CA` | Brand accent on navy. |
| Paper / white | `#F5F8F7` / `#FFFFFF` | Light surfaces. |
| Muted / border | `#566574` / `#D8E2E6` | Supporting text and dividers. |

Brand accents do not communicate prediction outcomes. Use separately defined outcome colors with readable Correct, Incorrect, Pending, Void or Unavailable labels. Keep the logo's surrounding background compatible with its variant.

Use `alt="Goal Hint"` for a standalone logo. A logo-only home link needs an accessible name such as “Goal Hint home”; when adjacent text already names the brand, use empty image alt text to avoid repetition. Exported wordmark outlines do not supply live UI typography: load Manrope separately if using it for interface text.

## Next.js metadata

Once the application exists, use the following in its root layout. These assets alone do not add application scaffolding or a web app manifest.

```ts
import type { Metadata } from 'next';

export const metadata: Metadata = {
  metadataBase: new URL('https://goalhint.com'),
  icons: {
    icon: [
      { url: '/brand/goal-hint-favicon.svg', type: 'image/svg+xml' },
      { url: '/brand/goal-hint-favicon.ico', sizes: '16x16 32x32 48x48' },
    ],
    apple: '/brand/goal-hint-apple-touch-icon.png',
  },
  openGraph: {
    images: [{
      url: '/brand/goal-hint-open-graph.png',
      width: 1200,
      height: 630,
      alt: 'Goal Hint — Football predictions. Clearly explained.',
    }],
  },
  twitter: {
    card: 'summary_large_image',
    images: ['/brand/goal-hint-open-graph.png'],
  },
};
```

## Sources and regeneration

Edit [brand-tokens.json](brand-tokens.json) and [`scripts/generate-brand.mjs`](../../scripts/generate-brand.mjs), then regenerate; avoid editing generated exports individually. The generator uses committed outlines from [source/type-outlines.json](source/type-outlines.json).

Requires **Node.js 20.9 or later** and **Sharp 0.35.4**. From the repository root, this PowerShell setup installs build tooling in the temporary directory without creating application dependencies:

```powershell
$brandTools = Join-Path $env:TEMP 'goal-hint-brand-tools'
npm install --prefix "$brandTools" --no-save --package-lock=false sharp@0.35.4
$env:BRAND_NODE_MODULES = Join-Path $brandTools 'node_modules'
node scripts/generate-brand.mjs
```

Optional type-outline rebuild: install Python's `fontTools` package, run `python scripts/build-brand-type.py`, then rerun the asset generator. Normal regeneration does not require Python.

The unmodified [Manrope source font](source/fonts/Manrope-wght.ttf) came from [Google Fonts](https://raw.githubusercontent.com/google/fonts/main/ofl/manrope/Manrope%5Bwght%5D.ttf). Its [SIL Open Font License](source/fonts/OFL.txt) is preserved alongside it; retain that license when redistributing the font.

The original raster is preserved unchanged as [reference/goal-hint-logo-original.png](reference/goal-hint-logo-original.png). It is a reference, separate from the generated production artwork. SHA-256:

```text
A2DB5021DCF657568CFA2BB9D87133C73C34170B70C7ACC9B1B1889ED413559C
```

Third-party team and competition images remain remote-only under the app specification; this locally bundled kit contains first-party Goal Hint branding.
