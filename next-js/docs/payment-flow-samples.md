# Payment flow samples

Review gallery: https://goal-hint-payment-flow-gallery.bluebee131.chatgpt.site

The private review Site contains ten interactive alternatives. Open a sample,
switch Mobile/Desktop, try the complete flow, and star favorites. Full-screen
links open the responsive flow directly. Favorites persist in the current
browser; payment details and screenshots stay in the current tab's memory.

The same gallery is available from the Next.js app at
`/payment-samples/index.html`. Source lives in `public/payment-samples/` and uses
one shared wizard engine, with separate presentation layouts and a small catalog.
There are no added dependencies or payment API changes.

## Flow

1. Choose a package.
2. Choose MTN/Airtel and view manual-payment instructions.
3. Add the sending number and screenshot.
4. Review, confirm and submit proof.
5. See demo pending status and a support-message preview.

Copy is deliberately minimal: no repeated stage descriptions, short choice
labels, concise instructions, and short action labels. The folded layouts show
only one visible stage heading. All components use square corners.

Package defaults are illustrative (Daily UGX 1,000, Weekly UGX 5,000, Monthly
UGX 20,000). Recipient numbers contain X characters and cannot receive money.
Submissions and support never send data or activate access. The gallery is
excluded from indexing. Only favorite concept IDs are saved to localStorage.

These samples follow the proposed screenshot-required flow. Production still
requires a transaction ID and permits an optional screenshot; adopting a sample
requires a separate decision and matching server validation changes.

## Verification — 26 October 2026

- JavaScript syntax checks passed for all four modules.
- All ten complete journeys passed in desktop browser testing. All ten also
  passed in the Mobile preview before the copy-only shortening; all ten desktop
  journeys and the mobile shared flow were rechecked after shortening.
- Both MTN and Airtel paths reached the expected demo pending status.
- Missing package, missing payer/proof, and missing confirmation stopped
  progression and showed inline feedback.
- Returning from review preserved the sending number and screenshot. Changing
  package cleared stale proof, retained the sending number, and required a new
  screenshot. The revised amount appeared in review and status.
- Switching Mobile/Desktop during review retained the active step and entries.
- The support action displayed a message preview without sending it.
- Representative gallery, mobile payment, proof, review, and status layouts were
  inspected in the in-app browser. Mobile previews used a 390px maximum frame
  and adapted to the narrower panel when necessary.
- The Sites deployment returned `succeeded` with the gallery URL above.

The valid-image path was exercised with locally generated demo PNGs. Negative
file-type/size/decode checks are implemented but were not separately exercised
through the operating-system file picker. No production payment, database, or
account operation was tested or changed.

## Re-publish

Run `python scripts/prepare-payment-samples.py` from `next-js/`. This stages the
public sources and the tracked hosting manifest in the ignored
`.tmp/payment-flow-site/` checkout. Use the Sites source workflow to commit/push
that snapshot and package the static files, then publish its exact commit and
archive. Credentials belong only in session memory/stdin. Generated archives and
the publication checkout stay out of the main application's Git history.
