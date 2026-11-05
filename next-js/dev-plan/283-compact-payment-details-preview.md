# 283 — Compact payment Details preview

## Scope and status

Design preview only, requested on 5 November 2026. The desktop/mobile samples
live in the requesting chat. Production checkout, validation, extraction,
navigation and deployment are unchanged. Implementation remains a subsequent
step; this plan does not describe shipped behavior.

## Proposed layout

- Retain the existing Package / Pay / Details / Review progress and one
  “Message or screenshot required.” notice. Keep desktop step labels inline;
  place mobile labels below their markers, consistent with the other previews.
- Retain the full-width Transaction message with its Paste action and conditional
  Clear action. Keep the existing message/screenshot optional-label behavior.
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
existing theme tokens. Use a reusable grid wrapper for the transaction fields
and a dedicated selector for the screenshot action row; do not change every
direct child of CheckoutScreenshot, because previews/removal have another
layout. Preserve attachment preview/removal, recheck/cancel states and all
existing replacement, duplicate, extraction and validation dialogs.

Keep the shared 40px fine-pointer / 44px coarse-pointer height independent of
viewport width, subtle control corners, square surrounding layout, keyboard
focus and readable labels in Porcelain Blue and Cobalt Night. Foreground work
continues to use NavigationProgress and aria-busy.

## Coordination and verification

- Coordinated with Package screen, Pay screen, and Audit & prediction engine.
  Package retains ownership of its checkout source changes and APP_OVERVIEW;
  Pay owns plan 282; prediction owns plan 280 and its active linked worktree.
- This change owns only plan 283. Generated preview and browser output remain
  outside the repository. No APP_OVERVIEW update is needed for an unimplemented
  presentation proposal.
- Preview QA passed for both Desktop and Mobile samples in light/dark themes at
  736px, 390px and 320px (12 combinations). Browser checks confirmed the desktop
  2:1 field ratio, stacked narrow fields, equal aligned image actions, five
  distinct inputs and no horizontal overflow. Message Clear/optional labeling
  and local attachment selection/removal passed. Light/dark screenshots were
  visually inspected, including the revised mobile step labels at 320px.
- Before production implementation, exercise the real checkout fixture and
  validate the existing screenshot/extraction/loading behavior. Preview checks
  do not establish payment or production workflow correctness.
