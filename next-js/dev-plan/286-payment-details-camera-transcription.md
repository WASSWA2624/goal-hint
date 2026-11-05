# 286 — Payment Details camera and transcription

## Approved scope

- Rename the third checkout step to Payment Details.
- Offer Take photo, Choose image and Paste image with shared control heights,
  compact thumbnail and full preview in both themes on desktop and phones.
- Display editable image text and prefill recognised transaction fields while
  preserving manual values and independent messages.
- Use truthful extraction/review statuses; OCR cannot verify incoming funds.

## Implementation

- One preparation/OCR/duplicate-check path handles camera, files and clipboard.
  Mobile uses device capture; desktop browser camera streams are video-only and
  stop on close or capture. Denied/unavailable cameras offer file selection.
- Text from image retains immutable raw OCR separately from edits. Client/server
  comparisons treat both as one source, require the image and raw text, cap raw
  text at 12,000 characters, and invalidate warning consent when source changes.
- Removing an image clears its visible transcript while retaining entered
  fields; independent message evidence stays. Replacements keep the old image
  until reading/checking succeeds. Images still require readable ID and amount.
- Manual-field markers stay in the in-memory draft; safe persisted progress
  continues to exclude payment evidence. Admin labels distinguish submitted
  image text from an original payment message and raw OCR.
- Android camera routing is implemented in the Flutter host; it requires a new
  host build. Windows camera permission remains denied and uses file fallback.
  Restarting Android during capture requires a fresh selection; no lost receipt
  is silently attached to another account or checkout.

## Coordination

Pay owns the combined commit. Details performs an independent read-only review.
Subagents own domain/server provenance, Flutter routing, and browser acceptance.
The prediction session owns isolated plan 285 and its active branch; preserve
that worktree, existing stashes and untracked payment-screenshots.

## Verification

- Focused checkout/provider/provenance/navigation tests: 30 passed; real MySQL
  checkout integration: 21 passed, no skips. Provenance tests cover raw/edited
  separation, missing images, malformed markers and the raw-text size limit.
- Browser acceptance: 26 grouped checks passed with no JavaScript errors or
  payment submissions. Geometry passed at 320/390/1440px in both themes with
  fine/coarse pointers, including 40/44px controls and thumbnails.
- Real file/clipboard OCR, simulated desktop camera capture/cleanup/denial,
  mobile capture routing, manual-field retention, independent messages,
  selection-aware transcript paste, raw-text warnings, preview, removal and
  explicit review consent passed. Delayed clipboard replies and active readers
  cannot change an abandoned step or leave its loading indicator active.
- The production checkout fixture compiled and passed TypeScript. Compiled
  desktop/light and phone/dark smoke checks passed. Screenshots were inspected.
- Final full TypeScript check, scoped ESLint, theme-token contract and whitespace
  checks passed. Independent
  source review found and verified fixes for transcript paste provenance and
  asynchronous draft merging/unmount cleanup.
- Flutter: six camera/document-routing tests and full analyzer passed; iOS plist
  parses. Physical Android/iOS capture remains unverified. The default Android
  debug build was stopped after about 18 minutes under severe host memory
  pressure. One process-local 1.5GB/one-worker warm-cache retry maintained more
  free memory but reached its five-minute limit without an APK or compiler
  diagnostic. Both owned build process trees were stopped; tracked Gradle
  configuration was unchanged. Native compilation remains unverified before
  release; these attempts are not recorded as passing or as source failures.
- No production deployment or real payment submission was performed.
