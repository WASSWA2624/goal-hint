# 282 — Subscription Pay presentation

## Status and scope

The user approved implementation for desktop/mobile in both themes and corrected
the wording to **earned days**. Implement the approved presentation while keeping
manual transfer verification, evidence requirements, and final confirmation.
The original synthetic previews remain outside this repository.

Coordinated with the Package session (281), Details session (283), and prediction
session (280). Pay and Details share a combined verification fixture and source
commit. Preserve unrelated work, active worktrees/branches, and existing stashes.

## Presentation

- Omit the trial-expiry notice on Pay. Match the approved package screen's
  Porcelain Blue / Cobalt Night appearance, compact desktop steps, mobile step
  labels, square structural surfaces, and subtle shared control corners.
- Keep the selected package name, duration, price, and Change action on one row
  on phones and desktop, beneath the small Your package label. Retain only the
  concise payment-choice prompt; the redundant Pay title stays visually hidden.
- On desktop, align the Mobile Money cards at the top left with the package
  summary at the top right and give them matching heights. On phones, keep
  package, payment choices and receiving details stacked in that order.
- Label the recipient **Names:** and keep Copy. Omit the name-check sentence,
  after-sending instruction and Next: add payment details footer.
- Stretch transfer details across the content width, with the amount at left
  and receiving number at right on the same row. Keep names and Copy below.
- Show MTN MoMo and Airtel Money as clearly selectable alternatives. Display
  the selected provider's receiving number, registered name, copy action, and
  amount together. Switching providers updates these details immediately.
- Prefer a valid current draft, then the most recent approved subscription's
  available Mobile Money provider, then MTN, then Airtel. An unavailable or
  incompletely configured provider must never become the default.
- Hide wallet credit at zero. With available credit, make its use explicit.
  Partial credit reduces the amount to transfer; full coverage leads to Review
  without receipt details. Keep provider choices visible so switching from a
  fully funded wallet payment remains obvious.
- Hide earned days at zero. With available days, offer **Redeem earned days**
  through the existing referral-only checkout, with a day selector and explicit
  final confirmation. Keep invitation/referral management separate.
- Preserve the manual transfer, evidence, and review process. The Mobile Money
  action reads "I've paid — continue"; a wallet-only action reads "Review
  payment" and requires confirmation before spending credit.

## Implementation

- Reuse existing shared components, theme tokens, control heights, and loading
  conventions. Extract reusable Pay presentation rather than duplicating the
  checkout workflow. Preserve draft and back-navigation behavior.
- Existing `availableWalletUgx` and `availableReferralDays` already exclude
  pending reservations. Use those balances rather than raw ledger totals.
- Query the latest approved, unreversed Mobile Money subscription payment for
  `lastMethod`, ignoring top-ups, wallet purchases, redemptions and unsuccessful
  reports. Preserve the chosen provider through wallet toggles and restoration.
- Rewards remain referral access days internally, not a separate points
  currency, and do not discount the package's cash price. Use earned days in UI.
- Clear an old combined earned-day choice on returning to Package/Pay, so no
  hidden reward contribution is submitted; retain existing later-step drafts.
- Keep the receiving fields and Copy control mounted when switching providers;
  update values immediately from current server-provided settings while the
  quote revalidates. Copy waits for verification, and continuation still checks
  a matching server quote. Preserve changed-detail protection and confirmation.
- Update `APP_OVERVIEW.md` with implemented behavior; source implementation does
  not imply a production deployment.

## Preview verification

Browser verification passed 22 checks: MTN default, Airtel receiving-number
switching, returning Airtel preference, hidden zero balances, partial wallet
arithmetic, full-wallet review, switching back to Mobile Money, and the separate
redemption entry. No JavaScript errors were observed. Desktop at 1024px and
mobile at 390px and 320px had no horizontal overflow in either theme. Visually
inspected desktop and mobile captures in both themes.

The desktop sample starts without wallet or rewards. The mobile sample shows
UGX 3,000 explicitly applied to a UGX 5,000 weekly package, leaving UGX 2,000 to
transfer, with 3 earned days available. This sample state does not imply automatic
wallet spending. Preview controls also expose a full-wallet payment and the
returning Airtel scenario.

## Implementation verification

- Focused checkout/provider/navigation tests: 25 passed, none skipped.
- Real MySQL checkout integration: 20 passed, including remembered-provider
  filtering and ordering; no skips and no production payment submissions.
- Scoped ESLint, TypeScript, theme contract and whitespace checks passed.
- Final production checkout fixture build passed compilation, TypeScript,
  static-page generation and startup using the integrated Pay/Details/progress
  source. No production deployment was performed by this change.
- The compiled build passed a four-case desktop/phone smoke in both themes:
  default provider, switching and receiving-number updates, no overflow and no
  JavaScript errors.
- Real checkout browser fixture: 26 grouped checks passed with a fine pointer
  and another 26 with a coarse pointer, with no JavaScript errors. Both themes
  passed at 320, 390, 1024 and 1440px with no horizontal overflow and shared
  40/44px control heights. Desktop/mobile screenshots were visually inspected.
- Verified horizontal package details, matching desktop provider/package cards,
  full-width amount/receiving-number alignment, hidden zero balances, explicit
  partial/full wallet use, provider defaults, restoration and earned-day consent.
- A delayed provider quote kept the panel, number and Copy elements mounted
  while updating the displayed provider values. A changed server destination
  blocked progression as expected. Final confirmation was never submitted.
- Details and progress acceptance are recorded in plans 283 and 284.
