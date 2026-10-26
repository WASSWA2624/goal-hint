# 003 - Embedded web app integration

**State: Not started.** Prerequisites: [001](001-foundation-and-platform-support.md) and [002](002-environment-urls.md). Follow [the specification](../../app-write-up.md) and [the shell requirements](../../prompts/flutter-app-shell.md).

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
