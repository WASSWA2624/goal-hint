# Complete logos in slip exports

The owner reported that on-screen badges became initials in downloaded slips. Supplied logos must render before export is available. A later clarification permits initials only for individual teams/leagues whose catalog entry has no logo.

- Reuse the on-screen resolver for provider crests, bundled equivalents of provider/FlagCDN flags and approved external HTTPS images. External images opt into anonymous CORS before assigning their source.
- Deduplicate all supplied logos and the required wordmark across every page. Load with six workers, two attempts per asset and a 15-second attempt limit. Await successful decoding and positive dimensions, with cancellation on drawer close or an exhausted asset.
- Create PNGs only after required assets finish. Preserve initials solely for null catalog logo fields; a failed or malformed supplied source blocks the export. Display loading progress and a retry error while both actions stay disabled.
- Reproduce the reported six-team demo, genuine catalog absence and controlled external responses in the sharing fixture. Verify delayed/error/decode/timeout/retry/cancellation behavior, PNG exports, pagination, both themes, lint, type checks and build.

## Verification

- Thirty-six focused tests passed, covering source resolution, bundled flag existence, decode gating, retries, timeouts, cancellation, pagination, downloads, native sharing activation/cancellation and the shared-slip journey.
- Browser acceptance: holding one supplied logo kept both actions disabled with no PNG preview; two failed attempts retained no image/download; Try again recovered after availability returned. Catalog absence exported initials only for the absent home-logo fields, retaining supplied away/league images. Explicit CORS rejection blocked export; a permitted CORS retry generated a downloadable, origin-clean PNG.
- The six-team reported demo exported its bundled badges. Real provider crests and light/dark phone/desktop visual checks passed with matching control heights. Intentional failed-image and fixture offline-worker console errors are expected in these acceptance cases.
- TypeScript, scoped ESLint, theme contract, production build and sharing HTML acceptance checks passed. The production build retains the existing download-catalog filesystem tracing warnings. No database/native-host changes are required for this fix; unrelated wider-suite and device limitations remain recorded in plans 255–256.
