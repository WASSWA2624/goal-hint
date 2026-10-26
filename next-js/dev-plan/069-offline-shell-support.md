# 069 Shared web support for offline startup

**Feature:** Let the web app and its Flutter shell reopen a durable, permitted cached view after a successful online visit, then safely refresh when the server becomes reachable.

**Depends on:** [017 Client state](017-client-state.md), [031 Public response cache](031-public-response-cache.md), [037 Live client refresh](037-live-client-refresh.md), [061 Prediction gating](061-prediction-gating-server.md), and the existing authentication and cache policies.

**Source:** [App specification](../../app-write-up.md), [Flutter shell requirements](../../prompts/flutter-app-shell.md), and the coordinated [Flutter offline-startup plan](../../flutter/dev-plan/004-persistent-offline-startup.md).

**Status:** Partial. The anonymous entry/cache and shared safe-update coordinator are implemented. Browser and Windows cold A/B startup, measured retries, failed-update retention and available-target lifecycle checks have passed. Android testing is deferred, and Apple/Linux qualification remains open. See [the contract](../docs/offline-startup.md) and [recorded progress](../docs/development-progress.md#069--anonymous-offline-startup-26-october-2026).

**Coordination:** Deliver and verify the shared web cache contract before Flutter plan 004 consumes it. Use the platform audit and integration baseline from [Flutter 001](../../flutter/dev-plan/001-foundation-and-platform-support.md) and [003](../../flutter/dev-plan/003-web-app-integration.md) where available. Completion of Flutter 004 is not a dependency of this web task. Installed-app persistence, reconnect, and release verification remain with Flutter [004](../../flutter/dev-plan/004-persistent-offline-startup.md), [005](../../flutter/dev-plan/005-reconnection-and-cache-updates.md), and [007](../../flutter/dev-plan/007-platform-builds-and-release.md).

## Inspect before implementation

Read the current code and applicable repository instructions. Before this implementation, `src/` and `public/` contained no service-worker registration or CacheStorage implementation. The new dedicated worker and anonymous contract are documented below; the existing live-refresh loop and Redux projection remain separate transient mechanisms.

Inspect `src/app/layout.tsx`, `src/state/`, `src/domain/private-paths.ts`, `src/server/http/private-http.ts`, `src/server/matches/public-http.ts`, `src/server/members/gated-reads.ts`, and `next.config.ts`. Existing match APIs use `private, no-store` and vary by cookie; private account, payment, owner, and analytics paths also prohibit caching. Server-side response caching is separate from a permitted durable client cache.

## Prompt

Implement the shared web portion of offline startup in `next-js/`, coordinating the minimal host integration with Flutter plan 004. Reuse existing web components, validators, navigation, state, and auth boundaries. Keep application UI, cache eligibility, sanitization, version handling, and business rules in the web app. Flutter adapters may supply missing platform storage or loading capabilities; they must obey the same web-owned cache contract.

1. **Establish actual platform capabilities.** Verify current official browser, Next.js, and selected WebView documentation and test the chosen engines. Record service-worker availability, secure-origin requirements, persistent storage, origin/cookie behavior, and offline navigation for browsers and each Android, iOS, Windows, macOS, and Linux WebView target. A passing browser test does not prove embedded support. Where an engine needs an adapter, define the smallest shared interface with Flutter plan 004; document and leave unresolved capabilities explicit.

2. **Define an explicit permitted cache.** Persist a viewer-independent app entry, required matching JS/CSS/fonts and first-party assets, and only deliberately permitted public read projections. Existing `no-store` responses must never be persisted. If current endpoints cannot supply cacheable content, introduce the smallest explicit anonymous offline projection through the existing server gates and validators, with its own reviewed cache policy; do not weaken private headers or save raw server caches. Exclude protected predictions, personalized HTML/RSC/hydration payloads, credentials, account/payment/admin/analytics responses, and other private data. Retain existing media rights and retention limits rather than caching cross-origin imagery indiscriminately.

3. **Support durable cold startup.** After a complete successful online initialization, store enough coherent entry/assets/data to close the browser or Flutter app and reopen the permitted cached web interface without a network request succeeding. Reuse the web interface rather than screenshots or native replicas. Bound stored content and route coverage; uncached routes and server-dependent features must show an honest offline/unavailable state. With no usable cache, including a first-ever offline visit, show a clear retry state coordinated with the Flutter host. Handle denied storage, eviction, quota exhaustion, and corrupt or incomplete entries without trapping startup.

4. **Preserve access boundaries.** Cache only the approved anonymous projection even when an authenticated user visits. Never persist or replay private/no-store responses through a service worker, JS storage, or native adapter. Clear any derived identity-sensitive state on logout/account change and keep concurrent tabs or WebViews from restoring it. Offline storage must not grant entitlement, revive an expired session, or reveal subscriber content. Financial, account, authentication, payment, and other server-dependent writes remain unavailable offline; add no queue, replay, background submission, or optimistic success for them.

5. **Refresh safely.** Treat network events as hints and confirm the configured server is reachable with a bounded, appropriate same-origin check before updating. Refresh on relevant startup/foreground/reconnection events while the app is running, respecting existing request deduplication, backoff, visibility, schema validation, version ordering, and freshness rules. Stage and validate a complete compatible cache version before activation; retain the last working version if downloads, verification, storage, or activation fail. Avoid mixing builds or allowing stale responses to overwrite newer data. Preserve active input, focus, navigation, and scroll; defer any required full reload until a safe user-controlled point. Display cached timestamps and offline/stale state without presenting old scores, predictions, or account status as current. Do not add a background execution service for a terminated app.

6. **Document the contract.** Record supported offline entry/routes, excluded data/actions, storage limits and invalidation, first-use behavior, update recovery, and platform-specific adapters or limitations. Explain production HTTPS and development-origin requirements, including physical-device addresses and their actual secure-context support. Update the relevant state/refresh documentation to distinguish the new permitted durable cache from existing transient state and server caches. Deliver web changes through the website without requiring a shell rebuild unless its native integration changes.

## Acceptance checks

- A production-like browser build completes online initialization, terminates completely, and cold-starts with networking disabled using the last permitted cached entry and content. Verify the shared contract in available embedded-engine harnesses from Flutter 001/003 and record actual OS/engine versions. Hand off the installed-app matrix to Flutter 004/005/007; unavailable engines remain untested, rather than being inferred supported from browser results.
- First-ever offline launch, an uncached deep link, partial bootstrap, corrupt cache, denied/evicted storage, and a missing required asset all produce a recoverable honest state.
- Reconnection, server outage despite an online network signal, timeout, failed/corrupt update, and interrupted activation preserve the previous working cache. A later valid update is safely applied without rebuilding Flutter.
- Refresh does not overwrite newer records, reset input or scroll, combine incompatible build assets, or create repeated polling/reload loops. Offline content is visibly dated.
- Inspect web-owned persistent stores in browsers and available embedded-engine harnesses after authenticated use, logout, account switching, and session expiry. Protected/no-store HTML, RSC, API data, credentials, payment evidence, and subscriber predictions are absent; offline startup cannot bypass existing gates. Hand off the same inspection requirements for any native adapter storage to Flutter 004/007.
- Offline account/payment/financial actions issue no successful request, queued mutation, delayed replay, or false success when connectivity returns.
- Run meaningful cache-policy, cold-start, version-transition, auth-leak, and recovery checks plus the affected existing lint, type-check, unit, rendering, and production-build checks. Browser results alone do not close Flutter plan 004's platform acceptance.

## Handoff

Update [dev-tracker.md](../dev-tracker.md) and `docs/development-progress.md` with the implemented contract, actual checks, platform evidence, and remaining limitations. Keep this row Not started until code work begins, Partial while required work/checks remain, and Completed only when its acceptance checks pass. Coordinate shared-contract changes with Flutter plan 004; do not mark its native verification complete from this web task.

## Implementation handoff — 26 October 2026

The [shared contract](../docs/offline-startup.md) defines the dedicated static
entry, strict anonymous projection, secure-origin requirement, complete hashed
bundle, staged activation, lifetime/bounds and excluded data/actions. Browser
close/reopen offline, synthetic identity/private-response exclusion, uncached
routes, rejected writes, missing/corrupt assets, eviction and quota-denial
recovery passed against a production-like fixture. A real old-to-new manifest
upgrade preserved the active document/input. Detailed evidence is recorded in
[development progress](../docs/development-progress.md#069--anonymous-offline-startup-26-october-2026).

The permitted saved route is `/en/matches` without query; root and `/en` fall back
to clearly labelled Saved matches, not subscriber Best Slips. At most 30 basic
fixtures are displayable for 24 hours. Normal HTML/RSC, protected predictions,
remote media, identity, credentials and private/no-store responses are excluded.
No offline writes are queued. Flutter uses its existing persistent browser
profile; there is no second native content implementation.

The 005 handoff adds one visible-document retry coordinator, public-only
preparation/status replies, legacy 004 lifetime verification, per-port
cancellation and nonqueued Web Locks for writer isolation. Worker code waits
for existing clients to close before activation; no input or navigation is
reloaded to apply cache updates. The current browser matrix has measured
5/15/30/60/300-second retries, retained A through failed derived-B updates, and
passed healthy-B activation plus full-process offline cold A/B startup. Windows
also preserved its active draft through valid B recovery and a separate-process
cold B launch. Browser draft preservation is qualified for the failure/cancel
path, not its final valid-B transition. This derived fixture adds a harmless
required asset to one existing build and does not replace 004's genuine Next.js
rebuild proof.

Overall status remains Partial. Installed-target evidence belongs in Flutter
004–005; Android testing is deferred, and Apple/Linux execution remains
unqualified. Browser success does not qualify an unavailable WebView.
