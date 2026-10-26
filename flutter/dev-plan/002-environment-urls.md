# 002 - Development and production URLs

**State: Completed — central configuration and installed Next.js loading verified on available Windows and physical Android targets during [003](003-web-app-integration.md).** Prerequisite: [001](001-foundation-and-platform-support.md). Follow [the specification](../../app-write-up.md) and [the shell requirements](../../prompts/flutter-app-shell.md).

## Outcome

Provide one reusable environment configuration for the web origin, without scattering URLs through widgets or platform adapters.

## Work

- Define explicit development and production configuration, including a documented per-run override for the reachable development origin. Use the selected deployed HTTPS origin for production and validate malformed or unsupported URLs before loading.
- Keep public URL configuration separate from secrets. Do not embed API keys, administrator credentials, session tokens, or private environment-file contents in the Flutter bundle or URL.
- Document desktop loopback, emulator-to-host routing, and physical-device LAN access for the selected platforms, verifying current official host-address guidance when implementing. Explain that a phone's `localhost` points to the phone and that the web server must listen on a reachable interface.
- Add only the network permissions and development transport exceptions actually required by the selected platforms. Scope any plain-HTTP allowance to development; preserve normal production HTTPS certificate validation.
- Keep the existing Next.js development workflow in `next-js/`. Confirm its development origin settings and server binding work with the documented addresses, updating shared web configuration only when necessary.

## Acceptance and handoff

- Load the same Next.js app from a desktop and at least one available emulator or physical device using the central configuration. Record each environment tested.
- A production build selects the production HTTPS URL; development overrides do not require source edits. Invalid configuration produces a useful shell error rather than a blank view.
- Check configuration with focused validation where it prevents an actual environment-selection error. Update [the tracker](../dev-tracker.md) with exact setup commands and remaining access limitations for [003](003-web-app-integration.md).

## Implementation record — 26 October 2026

The shared configuration and safe startup error are implemented. Development
origins require no source changes; Profile/Release accept only the fixed
production HTTPS origin. Debug-only native HTTP allowances and production
network permissions are configured. Desktop and a physical Android phone both
retrieved the same Next.js app, including a phone development JavaScript asset.
Windows and Android Release builds passed. Apple configuration was checked
statically; Apple native execution requires a macOS host.

Installed loading is now verified through 003's browser adapters: the Windows
shell loads the app through loopback, and the physical Android shell loads the
same Next.js app through the development computer's LAN origin on port 3000.
Both use the central resolver. This completes the originally deferred loading
item for those available targets; Apple runtime and Linux adapter qualification
remain explicit in 003 rather than inferred from host HTTP probes.
See [the guide](../docs/development-urls.md) and
[the tracker](../dev-tracker.md#002-environment-handoff--26-october-2026) for
commands, results, and the integration handoff.
