# Goal Hint Flutter shell

This directory is reserved for the Flutter project. The shell is specified in
[the implementation prompt](../prompts/flutter-app-shell.md); Flutter source and
platform projects have not yet been generated.

The planned shell loads the Next.js application from a configurable development
or production URL. Screens, navigation, theming, and business logic remain in the
[shared web application](../next-js/README.md). Installable builds will target
Android, iOS, Windows, macOS, and Linux, with platform-specific build requirements.

After a successful online load, the shell must be able to start from persistent
cached assets and permitted content offline, then safely refresh when the server
is reachable. Offline startup and these installable builds still need implementation
and platform verification.

See [the app write-up](../app-write-up.md) for the product requirements and the
repository layout. Put all future Flutter source, tests, assets, configuration,
and generated platform projects in this directory.
