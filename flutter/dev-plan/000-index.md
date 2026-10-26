# Flutter shell development plan

**Foundation generated.** A minimal startup scaffold and native platform projects exist. URL configuration, embedded web integration, offline support, installed branding, and release acceptance remain planned in steps 002–007. Use [the Flutter tracker](../dev-tracker.md) for actual execution status, acceptance results, and verification evidence; generated projects alone do not prove platform support.

Read [the app specification](../../app-write-up.md), [the shell requirements](../../prompts/flutter-app-shell.md), applicable repository instructions, and the current handoff before implementing a step. The Next.js app owns the screens, navigation, authentication, and business logic. Flutter supplies the smallest necessary hosting and platform integration layer.

## Execution order

| Step | Feature | Direct prerequisites |
| --- | --- | --- |
| 001 | [Foundation and platform support audit](001-foundation-and-platform-support.md) | Existing specification and shell requirements |
| 002 | [Development and production URLs](002-environment-urls.md) | 001 |
| 003 | [Embedded web app integration](003-web-app-integration.md) | 001, 002 |
| 004 | [Persistent offline startup](004-persistent-offline-startup.md) | 003 and the verified cache contract from [web 069](../../next-js/dev-plan/069-offline-shell-support.md) |
| 005 | [Reachability and safe updates](005-reconnection-and-cache-updates.md) | 004 |
| 006 | [Installed identity and appearance](006-app-identity-and-theme.md) | 003 |
| 007 | [Platform builds and release acceptance](007-platform-builds-and-release.md) | 001-006 |

Run Flutter commands from `flutter/` and web commands from `next-js/`. Paths in a feature plan are relative to the application it identifies; links explicitly cross project boundaries when needed. Keep general task prompts under repository-root `prompts/` and each application's numbered development plan in its own `dev-plan/` directory.

## Working and handoff rules

1. Inspect the implemented predecessor and its recorded evidence before changing code. Reuse existing code and finish incomplete prerequisite work before dependent behavior relies on it.
2. Execute the requested feature with its necessary integration and meaningful checks. Use reusable components, minimal platform adapters, and square component corners. Keep application features in the shared web implementation.
3. When a feature needs shared offline changes, implement those in `next-js/` and coordinate the handoff with [web 069](../../next-js/dev-plan/069-offline-shell-support.md) and [the web development plan](../../next-js/dev-plan/000-index.md). Record the affected web files and checks in both application trackers; do not create a second implementation in Dart.
4. Verify current official Flutter, plugin, and platform support when selecting implementations. Record the chosen versions, sources, limitations, and tested combinations. Do not infer that one WebView package supports all five targets or that a successful build proves offline support.
5. Update the tracker with files changed, checks actually run, platform results, remaining issues, and the next dependency. Use **Not started**, **Partial**, or **Completed** honestly. An unavailable toolchain or unsupported capability stays explicit; continue independent work that can be verified.
6. Preserve the last working app during failures. Keep credentials, signing secrets, private environment files, and generated output out of Git. Follow existing release authorization and the actual platform signing requirements when a release is requested.

Example handoff: implement `flutter/dev-plan/001-foundation-and-platform-support.md`, record results in `flutter/dev-tracker.md`, and identify the next prerequisite. A plan's existence is never completion evidence.
