# Goal Hint Flutter shell

This directory contains the Flutter shell's [development plan](dev-plan/000-index.md)
and [execution tracker](dev-tracker.md). All planned steps are **Not started**;
Flutter source and platform projects have not yet been generated. The shared
[implementation prompt](../prompts/flutter-app-shell.md) defines the shell requirements.

The planned shell loads the Next.js application from a configurable development
or production URL. Screens, navigation, theming, and business logic remain in the
[shared web application](../next-js/README.md). Installable builds will target
Android, iOS, Windows, macOS, and Linux. The foundation step must verify current
official WebView/platform support and build requirements for each target;
unverified or unsupported capabilities must remain explicit.

After a successful online load, the shell must be able to start from persistent
cached assets and permitted content offline, then safely refresh when the server
is reachable. Offline startup and these installable builds still need implementation
and platform verification.

See [the app write-up](../app-write-up.md) for the product requirements and the
repository layout. Put all future Flutter source, tests, assets, configuration,
generated platform projects, and the local `dev-plan/` in this directory. Keep
general shared prompts in repository-root `prompts/` and the web development plan
in `next-js/dev-plan/`.

Execute the requested numbered step using the index's dependency and handoff
guidance. Record actual changes, checks, and remaining issues in the tracker;
plan files are not completion evidence. Run future Flutter commands from
`flutter/` and web commands from `next-js/`. Necessary shared offline behavior
belongs primarily in the Next.js app, with minimal native adapters and no
duplicate screens or business logic.
