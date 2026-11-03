# Application loading performance

## Scope

- Preserve the existing screens, content, result definitions, access rules and theme tokens.
- Start Matches performance reads on the server beside the primary list. Stream the summary independently, render its existing heading and outcome controls with unknown values while loading, and avoid an immediate duplicate browser read.
- Retain confirmed summary figures during background refresh and temporary failures. List pagination and cohort-version changes must not restart an unrelated period audit. Keep explicit retry and the existing one-minute refresh cadence.
- Stream prediction and publication reports independently into their existing dashboard sections. Filters and section headings appear before either slow report; invalid queries still resolve before streaming.
- Stream the homepage after legacy redirect validation, preserving its real filters, yesterday labels, unknown counts and slip placeholders while data loads. Preserve final entitlement rechecks and result projection.
- Reuse loading content inside the authenticated owner layout, keeping its navigation usable across all admin and analytics screens. The owner gate precedes this boundary.
- Overlap Best Slips list/yesterday reads, account recovery-state reads and the account's applicable data reads. Index stored slip results once per batch without changing original-cycle, completion or first-match checks.
- Reuse successful header-session display state for at most five seconds across rapid route remounts. Keep explicit refresh, focus, restoration, expiry and server authorization fresh. Never persist private state or cache errors.
- Streamed loading states use inherited semantic color variables so an unhydrated fallback follows the selected theme. Keep concrete control geometry and breakpoints, and preserve the existing header artwork in both themes.

## Verification

- 117 focused loading, performance, published-slip, original-cycle, access and theme tests passed. A further 48 integrated loading/theme/community-alert checks passed after the concurrent main update; 65 isolated rerun checks passed.
- Targeted ESLint, TypeScript, the shared theme contract and optimized production builds passed. The offline manifest was generated from the production build.
- The production loading fixture passed feed/home streaming and ten complete dashboard states. With a deliberately delayed 1.8-second report, the shell arrived in 302ms versus 1,833ms for a blocking render. Publication history arrived before predictions without holding filters or headings.
- Nineteen browser checks passed: Matches and Performance in both themes at 320, 390, 768 and 1440px; homepage filters in both themes; and a failed-summary retry. Summary heights stayed stable, initial streamed summaries made no duplicate browser request, and no hydration errors or viewport overflow occurred in those cases. Loading header artwork and summary colors followed the selected theme.
- A broad audit reported 2,758 passes, 24 failures and one skip across 2,783 checks. Twenty-one failures reproduced on the unchanged baseline; the other three timing/build failures passed when rerun in isolation. The broad suite remains unclean. Existing defaults, navigation/copy and isolated dependency-resolution failures are outside this performance change.

The fixtures use controlled synthetic delays without live provider or database reads. These measurements establish rendering behavior, not hosted latency or an SLA. Native-host/device performance and production response times still require measurement after deployment.
