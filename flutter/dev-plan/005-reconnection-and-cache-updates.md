# 005 - Reachability and safe cache updates

**State: Partial — shared reachability/update safety and Windows/browser acceptance passed; other native targets remain unqualified.** Prerequisite: [004](004-persistent-offline-startup.md). Follow [the specification](../../app-write-up.md) and [the shell requirements](../../prompts/flutter-app-shell.md).

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

## Implementation and available-host evidence — 26 October 2026

The shared web controller owns validated reachability, bounded retries,
Retry-After, hint deduplication and lifecycle cancellation. Preparation stages
and verifies a complete candidate before changing the active cache pointer;
failures preserve the previous bundle. It never reloads an active document,
queues writes, or forces a waiting service worker over existing clients.

Native Windows acceptance retained the real WebView2 profile and used the
built shared application/worker through an owned fault proxy. It verified
automatic retry, repeated connection hints, 503/captive/401 responses, missing
and interrupted required assets, timeout, prior-version cold startup, and a
later coherent generation becoming available. An unsent synthetic DOM draft,
history, focus, selection and scroll survived. A synthetic failed POST was not
replayed; real account/payment data was untouched. Generation B is a coherent
derived acceptance bundle with a new required asset, not a second release build.

Actual OS minimize/restore exposed a Windows visibility gap. The minimal fix
forwards hidden/resumed through the selected plugin's existing pause/resume APIs;
the shared shell orders calls, coalesces hidden/paused and remembers hidden
startup. The repeat verified actual Flutter and browser hidden/visible events,
then automatic recovery while the browser's connectivity hint remained false.
This is an application-origin outage/protocol-hint check, not an OS radio test.

See [the tracker](../dev-tracker.md) and
[reproduction guide](../integration_test/README.md#reachability-and-safe-updates)
for recorded results. Further Android checks remain stopped at the owner's
request; iOS/macOS need their native host and Linux still lacks a qualified
embedded engine. These gaps keep 005 Partial.
