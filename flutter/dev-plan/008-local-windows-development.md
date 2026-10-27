# 008 - Local Windows development

**State: Completed — explicit development launch paths implemented and the Windows Debug host visibly rendered the local Next.js application.** Prerequisites: [002](002-environment-urls.md), [003](003-web-app-integration.md).

## Outcome

Run the Windows shell against the local Next.js development server without changing the installed production app or its fixed release origin.

## Implementation

- Keep the existing central resolver: Debug defaults to development at `http://localhost:3000`; Profile/Release use `https://goalhint.com`.
- Provide `tool/windows/run-dev.ps1`, which always runs the normal entry point in Debug with explicit development defines. An optional `-Port` selects another local development port.
- Provide a repository VS Code launch configuration with the same Debug mode and localhost defines.
- Document that the installed production shortcut continues to load the deployed site. A hosting suspension there does not change development routing.
- Verify the resolver, shell startup, launcher syntax and native development launch; preserve the existing production install and configuration.

See [development URLs](../docs/development-urls.md) for commands and [the tracker](../dev-tracker.md) for actual results.

## Verification — 27 October 2026

Flutter analysis passed with no issues (257.1s); all 14 focused configuration and
startup widget checks passed. The new launcher built Windows Debug in 203.0s and
started the workspace executable. Native screen verification identified PID
37340/window 52101868 and showed the local Best Slips page, its consistent dark
header/navigation/content and development Rendering indicator. The hosting
suspension page was absent. The consent prompt remained untouched, and no
authentication or privacy state was changed. The Debug app remains running for
development; the production origin and installed release remain unchanged.
