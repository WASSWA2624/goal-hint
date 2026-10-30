# 184 — Joined desktop sections

Remove page-background gaps around filter sections and adjoining summaries or
results on desktop. Keep the existing sticky filters, local control spacing,
card spacing and mobile layouts.

Use shared `joinedDesktopSections` geometry for the Matches section stacks,
Best Slips, Builder, Performance and the Analytics owner column. Remove desktop
top padding from app pages and Analytics. Reuse the app-header offset for
Analytics filters instead of their older fixed offset. Owner record workspaces
already have zero desktop gaps and require no change.

Check zero-distance section boundaries, initial and intermediate scroll
positions, 1440px/1024px, Light/Dark and original 375px spacing. Use isolated
actual-component previews for gated layouts or unavailable data-backed pages,
and distinguish those checks from live-page acceptance in the progress log.
Run changed-file lint and strict type checking. Record the completed checks in
the tracker and progress log.

Completed: changed-file ESLint and strict type checking passed under Node
24.18.1. Twenty desktop layout/theme cases and mobile spacing checks passed
across live public screens and isolated actual-component previews. The progress
log distinguishes the live Performance timeout and gated Analytics limits.
