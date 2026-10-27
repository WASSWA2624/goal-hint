# 082 Default Predictions only

Select and apply Predictions only by default wherever the existing access rules
allow that filter, including Reset, while preserving an explicit unchecked choice.

1. Apply page defaults after query validation: subscribers and finished results
   start with predictions only. Unfinished guest feeds keep the current access
   restrictions and remain usable.
2. Preserve explicit `picks=all` in page URLs, date changes, searches and
   pagination; fresh navigation should use the eligible page default.
3. Keep anonymous API parsing and offline snapshot defaults unchanged. Reset the
   UI to the eligible page default without changing section-reset semantics.
4. Verify defaults, opt-out/reload, Reset, guest access, query preservation and
   existing API/offline behavior, then commit/push the integrated result.

## Verification

- Full ESLint, application TypeScript and the production build passed. The
  offline manifest generated with twenty-four pinned assets.
- All 177 relevant query, filter, navigation, pagination, SEO/calendar, paywall
  and offline projection test cases passed across the targeted runs. Four new
  default-selection tests cover eligible page defaults, unchanged API defaults,
  explicit opt-out URLs, Reset and fresh navigation.
- Four phone/desktop browser cases in both themes passed checked defaults,
  opt-out, reload, search/date/period preservation and Reset restoration. Eight
  guest contract cases confirmed the existing unfinished/finished access rules.
  Compact desktop row checks passed at 1024 and 1440 px without overflow.
- Settled desktop and phone-sheet screenshots were inspected. Browser reports
  remain ignored under `output/playwright/feed-page-defaults/`. The synthetic
  fixture's API transport flag was adapted to mirror the production handler;
  only its expected missing offline-worker registration messages remained.
