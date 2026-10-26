# 005 - Reachability and safe cache updates

**State: Not started.** Prerequisite: [004](004-persistent-offline-startup.md). Follow [the specification](../../app-write-up.md) and [the shell requirements](../../prompts/flutter-app-shell.md).

## Outcome

Refresh permitted content and cached web assets when the configured server becomes reachable, preserving a usable installed app and the last working cache if an update fails.

## Work

- Treat network-connection events as hints, then verify the configured application's reachability using a bounded existing endpoint or a small shared-web mechanism. Distinguish no network, captive/unusable access, unreachable server, and authentication expiry without mistaking a login/error page for a successful update.
- Use bounded retries with backoff and lifecycle cleanup. Avoid duplicate refresh loops, tight polling, overlapping cache activations, and work that continues after the shell is disposed.
- Share the update/version contract with [web 069](../../next-js/dev-plan/069-offline-shell-support.md). Fetch a coherent candidate version and validate its required assets before activation. Replace cached versions safely so interrupted or failed downloads retain the last working version and recover on the next start.
- Refresh content in the background where possible. Do not reload an active form, discard unsaved input, reset navigation unexpectedly, or activate incompatible asset/data versions while the user is working. Apply updates at a safe point using the existing web state model.
- Keep private-cache, expiry, logout, and account-isolation rules from 004 intact. Server-dependent actions remain subject to normal authorization and are not silently replayed on reconnection.

## Acceptance and handoff

- Test offline-to-online recovery, a connected device with an unreachable server, request timeout, repeated connection changes, and background/resume behavior on the available targets.
- Interrupt an update, remove a required asset, and return server errors; the previous working offline version must still cold-start. Then restore connectivity and verify a complete newer version becomes available.
- Verify an active form and navigation survive background refresh, and that session expiry follows the existing web behavior. Record version transitions, checks, limitations, and coordination with `next-js/` in [the tracker](../dev-tracker.md).

## Handoff from 004

Reuse the [shared offline contract](../../next-js/docs/offline-startup.md): the
anonymous snapshot, pinned manifest, verified immutable bundles, atomic active
pointer, and `PREPARE`/`STATUS` messages already exist. Startup/online/visibility
hints share bounded preparation without reloading a document. Qualify the
remaining reachability, retry/backoff, foreground and interrupted-update cases
on each available native target rather than adding another cache or refresh
loop. [The tracker](../dev-tracker.md) records Windows/browser evidence and the
unverified final Android cold restart, Apple execution and Linux embedding.
