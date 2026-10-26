# Goal Hint

Goal Hint provides football fixtures, predictions, analysis, and recorded results.
The Next.js application owns the interface, server, and business logic. The Flutter
shell embeds that shared web experience using native browser adapters.

```text
goal-hint/
├── next-js/          # Web client, server, workers, database, tests, and runbooks
│   └── dev-plan/     # Numbered Next.js implementation plans
├── flutter/          # Native web host, platform adapters, and native projects
│   └── dev-plan/     # Numbered Flutter shell implementation plans
├── prompts/          # Shared feature requests and specifications
└── app-write-up.md   # Product specification and shared application architecture
```

- [App write-up](app-write-up.md)
- [Next.js setup and commands](next-js/README.md)
- [Flutter status and requirements](flutter/README.md)
- [Flutter implementation prompt](prompts/flutter-app-shell.md)
- [Next.js development plans](next-js/dev-plan/000-index.md)
- [Flutter development plans](flutter/dev-plan/000-index.md)

## Run the web app

Use the Node.js, npm, and Python versions described in the
[Next.js setup guide](next-js/README.md). From the repository root:

```sh
cd next-js
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). Run the web application's other npm
and Python commands from `next-js/` as well. Its environment files, local runtime
state, database schema, deployment tooling, and generated output belong there.
To invoke npm from the repository root, use `npm --prefix next-js run <script>`.
The complete web validation command is `npm --prefix next-js run check`.

## Flutter shell

The Flutter host inside `flutter/` uses central development/production URL
configuration, origin validation, native transport policy, and browser adapters
for Android, iOS, macOS, and Windows. It preserves web navigation and sessions
without duplicating product logic. Linux has a native runner but no qualified
embedded browser yet. Goal Hint names, shared launcher artwork, and white launch
surfaces are implemented. Native feedback and desktop chrome follow the shared
web theme; Windows light/dark, reload and restart checks passed. Remaining
appearance qualification is tracked in 006.
The shared web code now saves a bounded anonymous offline view with compatible
assets; [offline setup and limits](flutter/docs/offline-startup.md) distinguish
production-like secure origins from normal development/HMR. Shared web
code checks reachability and refreshes verified cache bundles with bounded retries,
preserving the last working version and active input after a failed update.
Platform qualification and release acceptance remain in 004–005 and 007.
[Native release instructions](flutter/docs/releases.md) cover the pinned SDK,
Windows installable bundles, Android signing and unavailable-host limitations.
Production launch is currently blocked by the hosting suspension at the retained
`https://goalhint.com` origin; no published release is claimed.
See the [Flutter tracker](flutter/dev-tracker.md) for actual execution status and
verification evidence, and the [implementation prompt](prompts/flutter-app-shell.md)
for the full requirements. Normal product changes continue to belong in `next-js/`.

For cable-free Android development, see
[wireless pairing, connection, and Flutter target selection](flutter/docs/development-urls.md#android-wireless-development).

Git metadata and shared development-tool configuration remain at the repository
root; app-specific configuration stays with its app. Local dependencies, private
environment files, runtime state, and build output are excluded from Git.
