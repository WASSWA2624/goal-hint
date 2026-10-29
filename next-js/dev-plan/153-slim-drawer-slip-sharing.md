# 153 — Slim drawer slip sharing

## Selection and scope

Implement selected desktop concept **03, Slim drawer**, from the
[sharing gallery](../design/desktop-slip-sharing/README.md). Best Slips and Slip
Builder use the same shared header action and drawer. The remaining gallery
concepts stay simulated design references. Mobile sharing UI is deferred.

## Interface and export

- Place the Share action beside the desktop slip header, outside its native
  summary, so sharing does not toggle the selections or introduce nested
  interactive controls.
- Load the narrow right-side dialog on demand. Retain native modal focus,
  Escape/backdrop dismissal, a branded image preview, concise caption links,
  Save image, Copy caption, and the primary WhatsApp action.
- Prepare real light-background PNGs from the immutable shared snapshot. Include
  the teams, market/pick, original odds, kickoff date/time in EAT, total odds,
  public slip ID, app URL, slip URL, and Created with Goal Hint branding.
- Preserve every selection, including long Unicode names. Measure and wrap full
  text; reuse a 1080px-wide canvas capped at 8192px height, with at most 32 rows
  per image. Larger slips use additional images and conditional preview paging.
- Download a single PNG directly. Package multiple PNGs and a UTF-8 caption file
  in one ZIP. Native file sharing receives all prepared image files.
- Check native file-sharing capability at the user action. Where unavailable,
  download the image/archive and open WhatsApp with its text caption. The user
  attaches the image(s) and sends the message in WhatsApp; a text URL cannot
  attach a photo automatically.

## Public snapshot and linking

Publish through an authenticated, entitled, same-origin request. Builder sources
submit bounded criteria and an existing slip identity for server rebuilding;
Best Slips sources resolve a sealed publication day. Client-provided prices,
selections, and outcomes are not accepted as authoritative snapshots.

Store a permanent immutable snapshot behind a random 128-bit token at
`/s/<32 lowercase hexadecimal characters>`. Public reads and re-sharing expose
no member identity. Retry deduplication and creation throttling reuse existing
member/database conventions. See [shared slip storage](../docs/shared-slips.md)
for the migration, insert-only grants, integrity checks, and retention behavior.

The website route works independently of native installation. The thin Flutter
host accepts the shared HTTPS route and provides Android/iOS association setup.
Actual installed-app opening requires deployed signing/team configuration,
association files, and a newly signed and installed app as described in
[app-link setup](../docs/slip-app-links.md). Neither a deployed migration nor
device-level domain verification is claimed by this source change.

## Verification

- All 60 focused web tests passed under the pinned Node 24 runtime: six image
  layout, five caption/download, eight backend, five association, and 36 runtime
  policy tests. The configuration example's expected-key list includes the two
  new public association settings.
- Full lint passed; targeted lint and TypeScript checking passed after the final
  browser capability guard fix. Prisma generation and schema validation passed.
- The final optimized production build passed, including its TypeScript check,
  all 21 static pages, sharing/public routes, and offline manifest generation.
  Production HTTP probes returned 200 JSON without redirects for both app-link
  association routes; unconfigured identities stayed empty. Invalid share tokens
  returned 404 through both the API and website route without a locale redirect.
- Browser checks produced a real 1080×1104 PNG, verified caption/WhatsApp link
  agreement, native file handoff and cancellation, manual-copy recovery, Escape
  focus restoration, and cached sharing without another publish request.
- The 800-selection browser case downloaded a real ZIP containing all 25 PNGs
  and its UTF-8 caption. Pages were 1080×6150, below the canvas height limit.
  Long exports report progress and retain close-to-cancel support.
- Both page contexts and existing public shares were checked, as were 403, 409,
  and 503 recovery states. Desktop widths 1440 and 1024 had no horizontal
  overflow; 390px retained the existing phone layout without the desktop action.
- All 51 Flutter tests and targeted Dart analysis passed. No signed-device
  verification is claimed.
- The broader web run recorded 2519 passes, five failures, and one skip from
  2525 tests. The new environment-example failure was fixed and the complete
  runtime-policy tests then passed. Four unrelated existing failures remain:
  `admin-routes.test.mjs` (literal POST assertion for conditional forms),
  `recommendation-publication.test.mjs` (fixture/default-criteria mismatch),
  `seo-metadata.test.mjs` (legacy source-pattern assertion), and
  `slip-cohort.test.mjs` (fixture expected generated rather than no-qualifying).
  Their implementation/fixtures were not changed by sharing.
- The genuine MySQL integration case skipped because no test-server binary is
  installed. Migration/grant application and signed-device domain verification
  remain deployment work; source and fixture tests do not establish them.
