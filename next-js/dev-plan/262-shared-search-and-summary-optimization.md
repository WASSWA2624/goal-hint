# 262 — Shared search and performance-summary refinement

## Scope

- Give inset search actions a faint themed fill, clear hover/press feedback,
  keyboard focus, disabled styling and reduced-motion support.
- Reuse SearchBar in all existing submitted and instant-filter searches,
  including admin screens, market lists and option/phone-country pickers.
- Put payment, subscriber and audit advanced filters beside search using the
  shared dialog with draft Apply/Cancel/Reset behavior; enable payment provider
  and sorting filters on mobile as well as desktop.
- Keep local lookup actions from submitting their surrounding form.
- Reuse PerformanceSummary across matches, Best Slips and reports; use
  container queries for narrow panels, wrap large counts, share static outcome
  definitions and memoize streamed count normalization. Pass report timestamps.

## Verification

- Full lint, type checking, the shared theme-token contract and production build
  passed. Two existing download-catalog tracing warnings remain.
- 83 targeted tests passed for search matching, audit date queries, subscriber
  filtering, phone-country selection, outcome totals and result navigation.
- 32 browser checks passed: 10 responsive light/dark combinations at 320–1440px,
  four touch combinations (44px controls), four interaction/accessibility checks
  and 14 admin workflow checks. Fine-pointer controls remain 40px.
- Hover contrast measured 10.15:1 in light and 7.25:1 in dark. Keyboard focus,
  disabled states, reduced motion, nested-form local lookup and large counts in
  narrow containers passed. Mobile status cards retain no icons.
- Subscriber/payment/audit dialogs passed Apply/Cancel and focus restoration;
  plan instant filtering and code form submission passed in both themes.
- Source audit confirms native search input markup is centralized in SearchBar.
  Theme SSR and submitted/live admin-search SSR passed. Plans renders its
  desktop search after hydration, preserving its existing responsive workflow.
- Browser checks use isolated synthetic fixtures. Background count/community
  endpoints are not fully implemented in that fixture; provider/deployment
  availability is outside these UI checks. Generated screenshots and browser
  launchers remain excluded from Git under output/playwright and .tmp.

Hosted deployment and native releases remain separate.
