# 003 - Embedded web app integration

**State: Partial — available Windows and Android fixture lifecycle/cold reopen passed; Windows TLS/live checks and full-app rendering on both targets are verified. Remaining manual input, Apple, and Linux qualification is recorded in [the tracker](../dev-tracker.md).** Prerequisites: [001](001-foundation-and-platform-support.md) and [002](002-environment-urls.md). Follow [the specification](../../app-write-up.md) and [the shell requirements](../../prompts/flutter-app-shell.md).

## Outcome

Display the existing Next.js application with its normal navigation, account sessions, and web-controlled appearance. Keep Dart code limited to the host and necessary platform behavior.

## Work

- Implement the selected WebView integrations behind the reusable boundaries established in 001. Use the centrally configured origin and a small consistent shell for initial loading, retryable load errors, and lifecycle handling.
- Preserve Next.js routing, links, query parameters, browser history, and normal reload behavior. Integrate native back navigation with web history where appropriate; follow verified platform behavior rather than adding a second navigation system.
- Define trusted application navigation and external-link handling. Use platform facilities for external destinations when necessary and avoid exposing a broadly privileged JavaScript bridge.
- Verify sign-in, registration, session persistence, account changes, administrator access where authorized, expiry, and logout through the existing web implementation. Respect cookie and HTTPS behavior; do not copy authentication or payment logic into Flutter or persist credentials in native preferences.
- Preserve keyboard/input behavior, safe areas, accessibility, resizing, and desktop window behavior. Keep the website in control of content and theme; expose only native appearance integration needed by [006](006-app-identity-and-theme.md).

## Acceptance and handoff

- Demonstrate representative navigation, native back behavior, an external link, web form input, and the normal account lifecycle on each available target.
- Reopen an installed shell and verify the intended session behavior without bypassing server-side authorization. Record platform differences or failures in the support matrix.
- Confirm app screens and domain behavior remain in Next.js. Update [the tracker](../dev-tracker.md) with integration boundaries, checks, and the offline capabilities ready for [004](004-persistent-offline-startup.md).

## Integration handoff

The [integration guide](../docs/web-app-integration.md) describes the reusable
host boundary, selected/pinned browser adapters, persistent profiles, native
navigation policy, loading/retry behavior, and platform differences. The
[native acceptance harness](../integration_test/README.md) uses existing
synthetic Next.js HTTP/account fixtures and a separate read-only live-app phase.
It includes a cold-process reopen check without clearing browser storage.

The web application remains the only implementation of product screens and
account/domain rules. Persistent browser storage is groundwork for 004, not an
offline cache or update mechanism. Linux still needs a real embedded-engine
prototype; Apple runtime qualification requires its native host. Keep remaining
checks explicit rather than inferring five-platform support from generated
runners or package platform lists.

Both available targets passed the synthetic first/reopen pair with the app and
profile retained. Android commits its ordinary WebView cookie store at suspend;
the test awaits that normal-close checkpoint without copying tokens or changing
server cookie lifetime/flags. Android runs passed over paired TLS wireless ADB.
Windows also passed the complete live-app/native-focus/back/text-scale phase
and an invalid-certificate Retry check without changing OS trust. Android's
normal app renders the LAN-hosted site and can open Chrome and return. Manual
keyboard/picker/window checks, Apple execution and Linux embedding remain open.
