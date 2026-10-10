# 055 On-device picks, alerts and profile

**Feature:** My Picks, the notifications bell and a Profile screen without accounts.

**Depends on:** [037-live-client-refresh.md](037-live-client-refresh.md), [051-feed-screen-layout.md](051-feed-screen-layout.md).

**Source:** [App specification](../app-write-up.md), section 1 (version 1.8 on-device features) and the [layout templates](templates/).

## Prompt

Add a star to cards and rows that saves the fixture in browser storage (bounded, versioned, wrapped in try/catch). My Picks lists starred fixtures through a public read of stored fixtures by ID, with outcomes once settled. The bell shows alerts for starred matches (kickoff, goals, full time) detected by the existing live refresh while the site is open; optional browser notifications need an explicit permission click. Profile stores defaults (markets, leagues, countries, sort) applied when the feed has no explicit filters, plus a clear-all-data control.

Replace the phone tab bar's Results and Info tabs with My Picks and Profile (Results moves to the top of the feed), and add the bell and a generic avatar to both headers. Never send identifiers, picks or preferences to the server.

## Acceptance checks

- Works with storage blocked or cleared; no cookies or visitor tokens are set.
- Privacy page updated to describe on-device storage.

## Handoff

Required: tick this row in [dev-tracker.md](../dev-tracker.md) only when implementation and checks are complete. Update `docs/development-progress.md` and `docs/implementation-decisions.md`.
