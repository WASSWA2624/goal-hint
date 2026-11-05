# 282 — Subscription Pay design preview

## Status and scope

Design preview only, awaiting the user's review and explicit implementation
go-ahead. No production UI, payment handling, or access rules changed. Desktop
and mobile interactive samples are stored in the owning chat's visualization
directory, outside this repository. Sample prices and receiving details are
synthetic; preview actions do not send payments or change account data.

Coordinated with the Package session (plan 281), which owns the shared checkout
components, and the prediction session (plan 280), which owns an active separate
worktree. Preserve their changes, branches, worktrees, and existing stashes.

## Proposed presentation

- Omit the trial-expiry notice on Pay. Match the approved package screen's
  Porcelain Blue / Cobalt Night appearance, compact desktop steps, mobile step
  labels, square structural surfaces, and subtle shared control corners.
- Keep the selected package, duration, price, and Change action together.
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
- Hide UndiDays at zero. With available days, offer a separate Redeem UndiDays
  entry. Referral and redemption workflow design remains separate work.
- Preserve the manual transfer, evidence, and review process. The Mobile Money
  action reads "I've paid — continue"; a wallet-only action reads "Review
  payment" and requires confirmation before spending credit.

## Implementation considerations after approval

- Reuse existing shared components, theme tokens, control heights, and loading
  conventions. Extract reusable Pay presentation rather than duplicating the
  checkout workflow. Preserve draft and back-navigation behavior.
- Existing `availableWalletUgx` and `availableReferralDays` already exclude
  pending reservations. Use those balances rather than raw ledger totals.
- Existing `lastMethod` can refer to a top-up, wallet payment, or redemption.
  Query the last approved Mobile Money subscription payment specifically when
  implementing remembered provider selection.
- Rewards are referral access days in the source, not a separate points
  currency, and do not discount the package's cash price. Confirm the proposed
  UndiDays display terminology during design review.
- Use current server-quoted receiving details, not remembered transfer numbers.
  Keep payment-detail-change protection and the final confirmation in place.
- Update `APP_OVERVIEW.md` when an approved behavior is implemented; this
  preview-only record does not change the implemented feature overview.

## Preview verification

Browser verification passed 22 checks: MTN default, Airtel receiving-number
switching, returning Airtel preference, hidden zero balances, partial wallet
arithmetic, full-wallet review, switching back to Mobile Money, and the separate
redemption entry. No JavaScript errors were observed. Desktop at 1024px and
mobile at 390px and 320px had no horizontal overflow in either theme. Visually
inspected desktop and mobile captures in both themes.

The desktop sample starts without wallet or rewards. The mobile sample shows
UGX 3,000 explicitly applied to a UGX 5,000 weekly package, leaving UGX 2,000 to
transfer, with 3 UndiDays available. This sample state does not imply automatic
wallet spending. Preview controls also expose a full-wallet payment and the
returning Airtel scenario.

Production tests and deployment are intentionally outside this design-only
step; implementation remains subject to the user's review.
