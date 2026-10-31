# 205 — Mobile slip status text and spacing

Remove the mobile slip status border/background while retaining status colours,
the live dot and accessible wording. Use one fixed text rail, including an empty
dot slot for plain statuses, so labels align across full slips and previews.
Tighten vertical header/selection padding and gaps, retain header disclosure,
the arrowless layout and left blue strip. Match the mobile Share icon to the
1.5rem status height with a square face, zero padding and the control radius.
Increase Best Slips spacing from 6 to 9px and Slip Builder from 9 to 13.5px
on phones only.
Desktop layout and standalone match-card styling remain unchanged.

Keep slip Share visible but disabled until the existing private session store
confirms a signed-in member with an active subscription. Its shared expiry timer
disables sharing even offline; revocation closes an open drawer. Apply this to
desktop and phone cards, including existing shared records. Keep the existing
server authorization and paid/trial/referral schedule; app/referral invitation
sharing stays available independently of subscription.

Reuse the production fixture with several statuses and an aggregate preview.
Visually verify both themes, narrow widths, live dots, spacing, full/preview
alignment and the existing header/share interactions. Record actual results,
commit/push main and preserve existing stashes/worktrees.

## Verification — 31 October 2026

- TypeScript (`npx tsc --noEmit`) and changed-file ESLint: passed.
- Member-session and shared-slip tests: 15 passed, including activation, pending
  payment, malformed/expired access, sign-out, renewal, exact offline expiry and
  existing server publication/recipient authorization. Referral invitation tests:
  3 passed; canonical links and native cancellation/fallback behavior are intact.
- Final production fixture build and sharing HTML/API acceptance: passed. The
  fixture uses synthetic accounts/slips with the database disabled. Restricted
  HTML/Flight/metadata, recipient access states and safe returns still pass.
- Chromium: 24 combinations across Builder/Best Slips, both themes and widths
  1440, 1024, 768, 390, 360 and 320px. All eight status labels (including the
  aggregate preview) align on phones. Status border/background are absent; the
  5px live dot and glow remain. Share resolves to 24 × 24px, zero padding and
  4px control radius, matching the 24px status height. No horizontal overflow or
  runtime JavaScript errors. Desktop status fill/border, labelled Share and
  4.5px list gaps remain unchanged. Mobile gaps measure exactly 9px and 13.5px.
- Chromium access matrix: 18 combinations of guest, inactive member and active
  subscriber across Builder, Best Slips and existing shared records at 390/1440px.
  Denied controls stay visible/disabled and issue no publication request or
  dialog. Allowed controls prepare images, preserve disclosure and return focus
  on Escape. Six expanded/collapsed pointer/keyboard checks at 320/390/1440px
  passed; phone selection gaps are 4px with 5px row padding and 1px team gaps.
- Changing access while open closes the drawer on both layouts; renewal
  re-enables Share without reopening it. An 8-second expiry with subsequent
  session requests failing disables Share and closes the drawer without
  navigation. A completed shared slip remains expanded for a guest, with its
  Share control disabled.
- Screenshots inspected locally under ignored `output/playwright/`: phone
  390px light, 320px dark and 390px expanded. Fixture-only console fetch failures
  include the absent service-worker script and the deliberate offline request;
  no application runtime exceptions occurred.
- Live deployment and physical-device behavior remain **Unverified**. No schema,
  migrations, real accounts or delivery services were changed.
