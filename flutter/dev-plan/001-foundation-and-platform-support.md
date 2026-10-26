# 001 - Foundation and platform support

**State: Completed — foundation and platform audit; available Windows runtime verified, with other platform verification limits recorded in [the tracker](../dev-tracker.md).** Prerequisites: [the plan index](000-index.md), [the specification](../../app-write-up.md), and [the shell requirements](../../prompts/flutter-app-shell.md).

## Outcome

Establish a minimal Flutter project entirely within `flutter/` and a documented, evidence-based approach for Android, iOS, Windows, macOS, and Linux. Preserve the existing Next.js application and repository layout.

## Work

- Inspect available Flutter/Dart SDKs, host operating systems, native build tools, and existing repository instructions. Choose and document a compatible supported toolchain when executing this plan.
- Verify current official Flutter and candidate WebView/plugin documentation for each target. Record platform/version support, native runtime requirements, navigation/cookie handling, persistence, offline asset delivery, and service-worker availability. Keep unavailable, unsupported, and unverified capabilities distinct.
- Select minimal maintained dependencies and reusable interfaces only where actual platform differences require adapters. Do not assume one package or service-worker implementation covers all targets. Identify a practical fallback or an explicit unmet capability where needed.
- Generate the platform projects in `flutter/`. Keep the normal web application in `next-js/`; provide only a minimal shell entry point and necessary lifecycle/platform boundaries, without recreating screens or domain services.
- Extend ignore rules for the generated platforms and document local setup and validation commands in the Flutter README. Keep SDK paths, caches, credentials, and signing materials local.

## Acceptance and handoff

- Formatting, analysis, and a basic build/run succeed for the platforms available on the host. Record unavailable target toolchains instead of claiming cross-platform completion.
- The support matrix links to official evidence and explicitly identifies offline or WebView capabilities that still need a prototype before later steps can rely on them.
- No web business logic or production data is changed. Update [the tracker](../dev-tracker.md) with the toolchain, chosen integration approach, checks, and blockers for [002](002-environment-urls.md).
