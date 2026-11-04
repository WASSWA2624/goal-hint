# 276 — Shared header loading

- Use the existing header progress bar for foreground navigation, content
  requests, and saves across public, member, admin, and analytics screens.
- Remove local loading-only copy, skeletons, and progress bars. Keep existing
  content, stable action labels, accessible busy states, and cancellation.
- Mark first-load fallbacks and standalone views with the same indicator.
- Document the rule in `AGENTS.md` and keep passive refresh quiet.
