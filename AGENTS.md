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

## Git workflow

- After executing each prompt, commit the intended changes and push them to GitHub.
- Consolidate branch work into `main`, verify the integrated result, and push `main`.
- After verifying their work is included in `main`, delete all other local and
  remote branches. Finish with the primary checkout on `main`.
- Inspect linked worktrees before changing or deleting their branches. Preserve
  uncommitted work first and keep their files intact when detaching a worktree.
- Preserve existing Git stashes for later unless the user asks to apply or remove
  them. Do not discard work as part of branch cleanup.
- Keep private configuration, credentials, dependencies, and generated output out
  of commits. Report actual verification results and any remaining limitations.
