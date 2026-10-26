# Goal Hint

Goal Hint provides football fixtures, predictions, analysis, and recorded results.
The Next.js application owns the interface, server, and business logic. The planned
Flutter shell will make that shared web experience installable on mobile and desktop.

```text
goal-hint/
├── next-js/          # Web client, server, workers, database, tests, and runbooks
├── flutter/          # Destination for the Flutter shell and platform projects
├── prompts/          # Feature prompts and numbered plans under dev-plan/
└── app-write-up.md   # Product specification and shared application architecture
```

- [App write-up](app-write-up.md)
- [Next.js setup and commands](next-js/README.md)
- [Flutter status and requirements](flutter/README.md)
- [Flutter implementation prompt](prompts/flutter-app-shell.md)
- [Numbered development plans](prompts/dev-plan/000-index.md)

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

The Flutter project has not yet been implemented. Its approved requirements
include configurable development and production URLs, matching app branding,
Android/iOS/Windows/macOS/Linux packaging, persistent offline startup after a
successful online load, and safe updates when connectivity returns. See the
[implementation prompt](prompts/flutter-app-shell.md) before creating it inside
`flutter/`. Normal product changes will continue to be made in `next-js/`.

Git metadata and shared development-tool configuration remain at the repository
root; app-specific configuration stays with its app. Local dependencies, private
environment files, runtime state, and build output are excluded from Git.
