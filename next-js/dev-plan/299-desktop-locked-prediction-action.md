# 299 Desktop locked prediction action

## Scope

Replace market, odds and probability on locked desktop match rows, including slip previews, with one shared lock-icon button labelled “Unlock prediction”. Keep authorized prediction values and existing mobile access controls.

## Implementation

- Give the shared desktop row an optional prediction action occupying the three prediction columns, with matching accessible descriptions.
- Reuse `UnlockButton`, its theme/control metrics and existing account/subscription routing. Ordinary matches return to their detail page; locked slip rows return to the containing published slip.
- Remove the enclosing desktop slip access overlay so individual buttons are reachable. Keep an explicit access action in the slip header.
- Preserve server authorization, completed/public predictions, unknown predictions, and authorized slip rendering.

## Verification

Check desktop feed and slip previews for guest and signed-in restricted viewers in both themes, with a lock icon, one button per locked row, no obsolete metric placeholders, correct grid bounds and usable pointer/keyboard navigation. Verify authorized/completed rows and the existing mobile controls, alongside paywall redaction regressions.

## Results

- TypeScript, targeted ESLint and all 46 paywall/match-card/slip-card regression tests passed.
- The production fixture built successfully. Corrected its readiness URL to `/en/matches`, since `/en` redirects, and made its safe-redirect expectation use the current public page defaults.
- All 32 browser cases passed across both themes: desktop at 1024/1440px, mobile at 390px, guest/restricted/authorized states, and mixed/completed slips. Locked rows have one shared-height button spanning the former metrics, valid descriptions and no intercepting overlays; authorized values remain visible.
- Pointer and keyboard activation retained match/slip return destinations. Desktop touch-pointer sizing passed, and screenshots confirmed both themes with no browser runtime errors or horizontal overflow.
- All 727 raw HTML/RSC/API/history/insight/oracle/slip/private-route checks passed across nine access states, including fresh-access downgrades. No authorization or redaction behavior changed.
