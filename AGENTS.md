# Repository instructions

## Code and interface

- Write efficient, professional, standard code and prefer reusable implementations.
- Keep UI components uniform and reusable. Avoid rounded corners unless necessary.
- Keep web screens and business logic in `next-js/`; the Flutter app is a minimal
  host for that shared web application.
- Keep each application's numbered implementation plans in its own `dev-plan/`.

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
