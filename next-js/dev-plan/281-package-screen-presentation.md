# 281 — Package screen presentation

## Scope

Implement the approved package-screen mockup using the existing Porcelain Blue
and Cobalt Night themes. Keep Pay, Details, Review, top-ups, authentication,
prices, and payment handling unchanged. Coordinate with the prediction session,
which owns plan 280 and a separate active worktree.

## Implementation

- Add one package-selection component: responsive radio cards, duration and total
  price, selected-package summary, empty state, and Continue to Pay.
- Apply the density revision: compact card padding, package name and duration on
  one line, no full-access helper, and desktop step labels beside their numbers.
- Scope the connected four-step progress presentation and visible heading to the
  package screen. Retain the shared wizard's existing presentation elsewhere.
- Omit purchase/referral toggles from this screen. Normalize old referral-only
  drafts when they return to Package; preserve later-stage drafts and funding.
- Hide the trial notice only while the package screen is shown. Preserve trial
  controls in Account and notices in other existing checkout states.
- Keep theme tokens, native keyboard selection, shared control heights, and
  subtle corners. Retain configured package order and prices.

## Verification

- Run checkout and workflow-navigation tests, scoped lint, and typechecking.
- Inspect real components in both themes at phone and desktop widths, including
  narrow screens, empty packages, long labels, keyboard selection, and restored
  referral-only drafts. Confirm Continue to Pay and Back preserve selection.
- Commit only this change and push main. Preserve active unrelated worktrees,
  branches, uncommitted changes, and existing stashes.

## Results

- Checkout and workflow-navigation tests: 21 passed, no failures or skips.
- Application TypeScript check, scoped ESLint, and the final compact checkout
  production fixture build passed. No full application build or deployment was
  performed for this UI-only change.
- Browser checks passed in both themes at 320, 390, 768, 1024, 1440, and 1920px.
  Standard cards measured about 51px high on phones and 85px on desktop.
  No horizontal overflow; desktop step numbers and labels share a line.
- Touch checks at 320/390px passed in both themes with six packages and the
  shared 44px action height. Fine-pointer actions retained their 40px height.
- Keyboard selection, Continue/Back selection retention, trial-notice scoping,
  empty and long-name/maximum-price packages, old referral-only draft restoration,
  later-stage referral drafts, and unchanged top-up presentation passed.
- Review screenshots remain in ignored `output/playwright/package-screen/`.
