# 012 — Recovery theme continuity and desktop update

Correct native recovery appearance and update the installed Android and Windows
hosts without replacing their persistent browser profiles.

- Mirror only bounded public appearance colors and the website's explicit
  Light/Dark/System choice to an origin-scoped application-support file. Restore
  it before the first native frame; malformed or unavailable storage is ignored.
  System follows OS changes rather than freezing a previously resolved scheme.
- Offer the same three choices while the website is unavailable. An explicit
  recovery choice is retained and applied to the owned website's public theme
  key when an actual application document returns. No account data or cookie is
  copied; no generic page-to-native bridge is introduced.
- Select the canonical primary/inverse artwork by effective theme. Generate and
  bundle the inverse mark through the existing artwork tool. Native bars and
  recovery surfaces use the effective theme, including when a stale browser
  appearance has a different scheme.
- Recognize the hosting provider's known suspension title/path even for HTTP 200
  and 403. Present service-unavailable guidance while leaving ordinary web-owned
  4xx pages intact. Preserve the intended application URL across the provider's
  redirect, so Retry can recover after hosting is restored.
- Increment the internal native build to 1.0.0+6. Android remains a development
  host for the existing LAN origin. The active Windows host uses the existing
  development packaging flow for
  `http://localhost:3000`, as requested. Existing app entry points launch that
  local build; the previous production installation and browser profile remain
  intact. Earlier binaries, browser data and stashes are preserved.

Tests cover restart persistence, ordered writes, bounded schemas, a saved Light
choice on a dark OS, System changes, inverse artwork, recovery selection and
browser retention. Native Windows acceptance includes unreachable/aborted loads,
503, HTTP 200/403 suspension pages, and a redirect back to the original route.
Device/installed checks and final command results are recorded in the tracker.

The production hosting account remains unavailable; installing this client
update does not restore the hosted application. Apple builds remain dependent
on a suitable macOS toolchain.
