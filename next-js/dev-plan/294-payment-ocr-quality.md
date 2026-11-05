# 294 — Payment photo reading and confidence

## Approved scope

Improve reading of blurry or unclear payment images with local image processing,
show recognition confidence, and allow correction of uncertain text. Keep the
existing compact desktop/mobile layout, both themes, and all evidence actions.

## Implementation

- Read a bounded, higher-quality source before upload compression. Reuse one
  local OCR worker for a maximum of three readings, trying enhancement only
  when the initial reading is incomplete or uncertain. Preserve cancellation.
- Select one whole reading. Never reconstruct missing transaction digits from
  guesses or combine conflicting transaction identifiers. Retain uncertainty
  when credible readings disagree.
- Show the engine's overall reading score, with transaction ID and amount
  confidence in a compact disclosure. Scores describe original image text,
  not manually corrected text, payment verification, or guaranteed accuracy.
- Keep partial and empty readings attached for manual correction. Required
  payment fields and explicit discrepancy review still apply before submission.
  The server independently checks the final transaction and image for reuse;
  incomplete or uncertain evidence stays subject to admin verification.
- Retain raw OCR separately from editable image text and original-message
  evidence. Removing an image removes its transcription and quality metadata;
  replacement preserves manual entries and clears obsolete machine suggestions.
- Keep image processing and private drafts on-device. Persist only safe checkout
  progress in browser storage. Uploaded evidence remains the prepared original,
  not the enhanced reading variants.

## Coordination

All work is isolated in `goal-hint-ocr` on `codex/payment-ocr-quality` while Auth
and Performance finish their primary checkout validation. OCR engine, evidence
domain/server validation, and browser acceptance have separate owners. Main
integration follows those active chats; preserve their worktrees and stashes.
No Flutter dependency or native camera changes are part of this task.

## Verification

- Pinned Node 24.18.1: 34 focused OCR, checkout and provenance tests passed with
  no skips. Pixel checks cover contrast, isolated noise, uneven illumination,
  blank images, input immutability, pixel bounds and cancellation. Evidence
  checks cover partial/empty readings, malformed metadata and manual review.
- Targeted engine TypeScript, scoped ESLint and the theme-token contract passed.
  Independent source review verified fixes for stale sender suggestions and
  correction of uncertain IDs before ownership lookup.
- Pending: synthetic before/after OCR comparison, desktop/mobile light/dark
  acceptance, production fixture build, MySQL integration and integrated checks.
