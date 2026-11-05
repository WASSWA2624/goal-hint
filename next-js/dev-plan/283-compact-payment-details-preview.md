# 283 — Compact payment Details layout

## Scope and status

The desktop/mobile preview was approved for implementation on 5 November 2026.
The source now uses the compact layout in both application themes. Payment
validation, extraction, navigation and submission rules are unchanged; source
implementation and production deployment remain separate.

## Implemented layout

- Omit the free-trial notice above Details, as subsequently requested, so the
  stepper and form move up without retaining an empty notice container.
- Retain the existing Package / Pay / Details / Review progress and one
  “Message or screenshot required.” notice. Keep desktop step labels inline;
  place mobile labels below their markers, consistent with the other previews.
- Retain the full-width Transaction message with its Paste action and conditional
  Clear action below the text, clear of its label. Keep the shared floating-field
  states and existing message/screenshot optional-label behavior.
- Keep Payment screenshot immediately below the message. Choose image and
  Paste image form equal-width columns spanning the available row, with matching
  tops, bottoms and shared control heights.
- Place Transaction ID and Amount paid (UGX) on the same desktop row with a
  2:1 width ratio and shared field alignment. Stack those fields on small screens
  without shrinking their controls or labels.
- Keep Number used to pay full-width below, including the country-code picker.
- Retain the existing equal-width Back and Next footer. Do not introduce a
  second heading, summary, attachment field or repeated action.

## Implementation constraints

Reuse FloatingField, AmountInput, PhoneInput, Button, PaymentScreenshot and the
existing theme tokens. CheckoutTransactionFields uses the shared control-row
alignment and a 2:1 grid at the shared tablet breakpoint, stacking below it.
CheckoutMessageField gives only this field a separate action row inside its
outline, below the scrollable text viewport, so long text cannot pass beneath
Paste/Clear. A dedicated
screenshot action selector stretches Choose/Paste without changing the preview,
removal, recheck or cancellation controls. Existing replacement, duplicate,
extraction and validation dialogs are retained.

Keep the shared 40px fine-pointer / 44px coarse-pointer height independent of
viewport width, subtle control corners, square surrounding layout, keyboard
focus and readable labels in Porcelain Blue and Cobalt Night. Foreground work
continues to use NavigationProgress and aria-busy.

## Coordination and verification

- Coordinated with Package screen, Pay screen, and Audit & prediction engine.
  Package is integrated; Pay owns plan 282 and integrates the shared checkout
  files and APP_OVERVIEW sentence after both UI reviews. Prediction owns plan
  280 and its active linked worktree. Preserve its branch and both Git stashes.
- Details owns checkout-details-styles.tsx, payment-screenshot.tsx, the Details
  JSX/imports in checkout-flow.tsx, screenshot styles in checkout-parts.tsx and
  this plan. Pay supplied the scoped Details wizard variant with square framing,
  the inherited 640px width, hidden heading and mobile labels below markers.
- Generated preview and browser output remain untracked. The implementation
  updates APP_OVERVIEW alongside the coordinated source commit.
- Preview QA passed for both Desktop and Mobile samples in light/dark themes at
  736px, 390px and 320px (12 combinations). Browser checks confirmed the desktop
  2:1 field ratio, stacked narrow fields, equal aligned image actions, five
  distinct inputs and no horizontal overflow. Message Clear/optional labeling
  and local attachment selection/removal passed. Light/dark screenshots were
  visually inspected, including the revised mobile step labels at 320px.
- Scoped ESLint and the shared theme-token contract passed. Existing checkout
  evidence/funding and provider tests passed (21 tests).
- Real checkout production fixtures compiled and passed TypeScript. Browser
  layout verification passed at 320px, 390px and 1440px in both themes with
  fine/coarse pointers (12 combinations), including 40/44px shared heights,
  exact desktop 2:1 sizing, mobile stacking, equal full-width image buttons,
  unique fields/actions and long-message scrolling clear of Paste/Clear.
- Real clipboard message extraction, Pay Back/Next and Review/Back draft
  preservation, Clear retaining entered fields, image OCR from file selection
  and clipboard paste, preview/close/remove, and duplicate-image rejection
  passed against the synthetic checkout API. No payments were submitted.
- Inspected light/dark desktop/phone screenshots. Screenshot recheck and
  cancellation handlers are unchanged; no special persisted-image fixture was
  added. Fixture-only missing service-worker/session routes do not represent
  production endpoint checks; no page exceptions occurred in the layout matrix.
- The Package chat separately owns the subsequently requested progress-edge
  alignment (plan 284); its final shared-stepper verification covers that change.
- The requested trial-notice removal passed live browser checks at 390px and
  1440px in light/dark themes: no notice element, no reserved gap above Details,
  and the evidence instruction and form remain present. Scoped lint passed.

## Uploaded screenshot refinement

- Use a reusable compact thumbnail option on the Details upload preview. Its
  square frame and contained image follow the shared 40/44px button height on
  desktop and phones, keeping the added attachment row compact.
- Preserve the full preview dialog, close/focus behavior, image removal, and
  normal thumbnail sizing on Review and admin screens.
- Original filenames are not retained by the prepared image Blob; no filename
  state is introduced for this presentation-only change.
- Browser checks passed at 390px and 1440px in both themes with fine/coarse
  pointers (8 combinations). Thumbnail, image, attachment row and Choose image
  measured exactly 40px or 44px; no horizontal overflow occurred. Full preview,
  close/focus restoration and removal passed in both pointer contexts, with no
  JavaScript errors or payment submissions. Screenshots were visually inspected.
- Scoped ESLint, TypeScript, shared theme contract and whitespace checks passed.
