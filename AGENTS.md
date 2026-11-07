# Repository instructions

## Code and interface

- Write efficient, professional, standard code and prefer reusable implementations.
- Use shared theme tokens instead of hardcoded UI styling values. Implement and
  verify every UI change in both light and dark themes, keeping corresponding
  styles and reusable components consistent across screens.
- Keep UI components uniform and reusable. Use the shared `theme.radius` scale
  for subtle corners appropriate to each component; see `next-js/docs/corner-radius.md`.
- Keep web screens and business logic in `next-js/`; the Flutter app is a minimal
  host for that shared web application.
- Keep each application's numbered implementation plans in its own `dev-plan/`.
- Reuse the shared control height and row layout across screens. Do not add
  viewport-specific control heights; see `next-js/docs/control-uniformity.md`.
- Use the shared `NavigationProgress` bar immediately below the app header
  for foreground loading throughout the app, including admin and analytics.
  Mark pending content with `aria-busy` or use `AppLoading` for a fallback
  without a content container. Keep existing content and control labels visible
  when possible. Keep passive polling and lazy media loading quiet.
- Keep constant chrome and value-only components from full remounts app-wide: do not reload UI that is unchanged across pages; update values in place when layout is fixed. Preserve UI and app logic; keep rendering efficient.

## App overview

- Update `APP_OVERVIEW.md` in the same change whenever app features, workflows,
  integrations, or access rules are added, changed, or removed.
- Keep the overview concise, complete, and accurate: cover critical implemented
  behavior and remaining limitations, replace outdated descriptions, and
  distinguish source implementation from deployment status.
