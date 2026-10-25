# Admin navigation, UI stability, and performance optimization

Optimize the existing Goal Hint app so that administrators retain access to regular site navigation and all admin screens feel stable, lightweight, and fast. Most of the app already works well. Preserve the existing interface and functionality while correcting navigation visibility and unnecessary reload or rendering behavior.

This is a focused implementation task. Investigate the current behavior, make the smallest effective changes, and verify the result. Avoid a redesign or an architectural rewrite.

## Scope

Cover the shared header, dashboard entry point, admin workspace, and all existing admin sections:

- Overview: `/admin`
- Payments: `/admin/payments`
- Codes: `/admin/codes`
- Subscribers: `/admin/subscribers`
- Password requests: `/admin/password-resets`
- Plans: `/admin/plans`
- Settings: `/admin/settings`
- Audit: `/admin/audit`
- Analytics: `/analytics`

Include the existing interactions within these screens, such as selecting records, searching, filtering, sorting, pagination, switching tabs, submitting forms, reviewing payments, generating codes, and refreshing reports, wherever those interactions already exist. Check the regular site screens when shared navigation or providers are affected.

## Preserve the existing product

- Keep the current screen layouts, visual hierarchy, spacing, typography, colors, icons, tables, forms, controls, responsive behavior, and working user flows.
- Retain all existing components and features. Do not remove content or introduce new widgets, screens, menus, animations, or loading designs as an optimization strategy.
- Restoring the existing regular site navigation on admin/dashboard screens is the only intended visible change. Reuse the established navigation components and their responsive overflow behavior.
- Preserve existing routes, links, query parameters, deep links, browser history, validation, business rules, permissions, and authentication behavior.
- Use professional, efficient, reusable code. Prefer shared components and uniform behavior over duplicated implementations. Preserve the current styling and do not introduce new corner radii or restyle existing components.
- Respect repository instructions and preserve pre-existing working-tree changes. Limit edits to the files needed for this task.

## Investigate before changing behavior

Trace a representative navigation and interaction flow before choosing a fix. Distinguish document reloads, route transitions, data revalidation, component remounts, and ordinary renders. Identify which behavior actually causes the visible instability.

Inspect shared layout ownership, page-level wrappers, provider placement, loading and Suspense boundaries, changing component keys, form submissions, navigation links, effects, polling, and mutation/refetch handling. Use browser network and rendering tools where helpful. Do not assume every render or framework refresh is a full-page reload.

Useful starting points in this repository include:

- `src/app/layout.tsx`, `src/app/admin/layout.tsx`, and `src/app/_components/admin-frame.tsx`
- `src/components/admin/admin-shell.tsx` and `src/components/admin/admin-workspace.tsx`
- `src/components/navigation/session-navigation.tsx`, `responsive-navigation.tsx`, and `navigation-link.tsx`
- `src/domain/admin-navigation.ts`
- The individual admin editors, their data/mutation helpers, and `src/components/analytics/dashboard/analytics-dashboard.tsx`

These are investigation starting points, not a mandatory edit list. The regular site's `SessionNavigation` already supports adding Dashboard for administrators; examine how the admin shell can reuse the established navigation behavior. Explicitly inspect Analytics because its route is outside `/admin`.

## 1. Keep regular navigation available to administrators

An authenticated administrator must be able to reach both the admin dashboard and the existing regular, non-admin site screens from the established navigation, including while viewing any admin section or Analytics.

- Keep the existing regular site menu destinations available instead of hiding them because the current route belongs to the admin area.
- Retain the admin section navigation and the existing Dashboard entry point. Preserve active states and current labels.
- Reuse the existing destination definitions, session handling, links, and responsive navigation components. Avoid a second hard-coded navigation system or duplicate headers.
- Verify desktop, tablet, mobile, and overflow menus. Keep keyboard navigation, focus behavior, and accessibility intact.
- Preserve the existing experience for visitors and ordinary members. Menu visibility must never replace server-side authorization or expose protected data.

## 2. Make navigation and interactions stable

Keep the persistent application header, admin navigation, and unaffected interface stable while the selected screen's content changes normally.

- Use the existing framework navigation for internal routes. Remove avoidable document reloads and unintended native form navigations from ordinary authenticated flows.
- Keep shared layouts and providers at appropriate persistent boundaries so routine navigation does not unnecessarily reconstruct the entire workspace. Make any necessary internal changes without altering the rendered design.
- Prevent unrelated data updates from resetting components through unstable keys, effects, or avoidable state replacement. Retain intentional resets, such as selecting a different record or clearing sensitive temporary credentials.
- For saves and other mutations, update the affected record, list, totals, badges, or report using authoritative results or narrowly scoped revalidation. Keep related counts and dependent views consistent.
- Assess broad route refreshes individually. Retain them where needed for correctness and scope them where feasible. Do not replace them with stale local values or optimistic success messages that can disagree with the server.
- Keep already loaded, authorized content visible during routine background refreshes. Localize existing pending, success, and error feedback to the affected control or region instead of blanking the whole screen.
- Preserve active filters, sort order, pagination, selected tabs/records, scroll, focus, and unsaved input through unrelated updates where appropriate. Respect intentional navigation resets and existing security requirements; do not keep every screen mounted or persist sensitive drafts indefinitely.
- Handle rapid interactions, overlapping requests, failures, and retries without stale responses overwriting newer results. Prevent duplicate submissions and clean up obsolete requests or subscriptions.
- Preserve session-expiry and authorization handling. Stability must not keep protected content available after access is revoked.

Normal renders and legitimate initial loading states are expected. The goal is to eliminate unnecessary remounts, visible flashing, page-wide loading replacements, focus loss, and layout movement during ordinary use.

## 3. Keep the interface extremely lightweight and fast

Base optimization decisions on observed costs and use the app's existing stack and conventions.

- Reduce duplicate requests, redundant data reads, repeated expensive work, unnecessary effects, subscriptions, and avoidable renders where evidence supports the change.
- Fetch only the data required for the current operation. Keep server work on the server where appropriate and avoid expanding client component boundaries unnecessarily.
- Reuse existing state and data utilities. Add memoization only where it addresses a measured or demonstrable problem.
- Use correctly scoped caching, request deduplication, targeted invalidation, and bounded refresh behavior where appropriate. Preserve data freshness, existing live updates, and isolation of private admin/session data.
- Keep route-specific code out of unrelated screen bundles where feasible. Do not preload every admin screen, add aggressive prefetching, introduce a heavy dependency, or add a new state library for this task.
- Preserve the dimensions and placement of existing content while requests complete. Avoid new animation or visual placeholders that change the design or increase rendering work.
- Check initial loads, repeat navigation, and common interactions. Improve perceived responsiveness and actual request/render costs without hiding required data or weakening business rules.

## Verification and acceptance criteria

Compare representative behavior before and after the changes using the same environment, data, and viewport. Use production-mode browser checks where available so development behavior does not distort the conclusions.

The work is complete when:

1. A signed-in administrator can access the existing regular site menus and Dashboard while visiting every listed section, including `/analytics`, on desktop and mobile.
2. Moving between sections preserves stable shared navigation. Browser back/forward, direct links, and normal route loading still work correctly.
3. Existing in-screen actions update the necessary data and feedback without unnecessary document reloads, workspace remounts, screen blanking, lost input, or focus jumps.
4. Saved changes and related counts reflect authoritative server state. Repeated interactions and delayed or failed requests do not create duplicates, stale overwrites, or misleading success states.
5. Screens retain their current appearance, components, layouts, responsive behavior, and functionality, with only the requested navigation visibility correction.
6. Authentication, authorization, session expiry, and private data handling remain correct, including ordinary member and signed-out behavior.
7. Representative loading and interaction checks show improved performance or no regression. Record meaningful observations such as document navigations, request counts, loading duration, remounts, or bundle costs where relevant. Report actual evidence rather than unsupported claims or arbitrary performance targets.

Reuse and run the relevant existing checks, including `npm run lint`, `npm run typecheck`, `npm run test:admin`, `npm run test:navigation`, `npm run test:state`, and `npm run build`, as applicable to the changes. Run existing rendering and domain-specific checks for affected flows, such as payments or analytics. Add focused regression coverage for changed navigation or state behavior when necessary; avoid tests that merely mirror implementation details.

Perform browser checks for representative actions on all listed screens, including slower requests, a failed action, repeated interactions, and desktop/mobile navigation. Compare screenshots where useful to confirm layout preservation. Use safe test data for state-changing flows. Clearly report any checks blocked by missing infrastructure or credentials.

## Delivery

Provide a concise report explaining the causes found, the focused fixes made, which existing shared components were reused, and how navigation, stability, performance, and layout preservation were verified. Include measured observations and any remaining limitations. Keep the final diff limited to this task and do not deploy as part of the work.
