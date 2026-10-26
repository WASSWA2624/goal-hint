# 055 On-device picks, alerts and profile

**Feature:** My Picks, the notifications bell and an on-device Profile screen; the header avatar is the account entry.

**Depends on:** [037-live-client-refresh.md](037-live-client-refresh.md), [051-feed-screen-layout.md](051-feed-screen-layout.md), [061-prediction-gating-server.md](061-prediction-gating-server.md), [062-gated-ui-entry-points.md](062-gated-ui-entry-points.md).

**Source:** [App specification](../../app-write-up.md), section 1 (version 1.8 on-device features; version 1.9 paid access) and the [layout templates](templates/).

## Prompt

Add a star to cards and rows that saves the fixture in browser storage (bounded, versioned, wrapped in try/catch). My Picks lists starred fixtures through a public read of stored fixtures by ID, with outcomes once settled. That read goes through the gated reads (`src/server/members/gated-reads.ts`): free viewers get the gated variant for unfinished fixtures, never a pick or probability. The bell shows alerts for starred matches (kickoff, goals, full time) detected by the existing live refresh while the site is open; optional browser notifications need an explicit permission click. Profile stores defaults (markets, leagues, countries, sort) applied when the feed has no explicit filters, plus a clear-all-data control. Subscriber-only defaults (probability range, probability sort, picks-only, odds) are ignored for free viewers, so a stored default never triggers the `subscription-required` refusal.

Replace the phone tab bar's Results and Info tabs with My Picks and Profile (Results moves to the top of the feed), and add the bell to both headers. The header avatar is the account entry: it reuses the 062 account icon and link (`/en/account`, labelled "Account") instead of adding a second control. Profile stays reachable from the tab bar. Never send identifiers, picks or preferences to the server.

## Acceptance checks

- Works with storage blocked or cleared; anonymous visitors get no cookies.
- With paid access on, My Picks HTML, page data and API responses for free viewers contain no pick or probability of an unfinished fixture; extend `scripts/verify-paywall-rendering.py` to cover it.
- Privacy page updated to describe on-device storage.

## Handoff

Required: mark this row ☑ Completed in [dev-tracker.md](../dev-tracker.md) only when implementation and checks are complete; mark it ◐ Partial while either remains after work has started, and leave it ☐ Not started before that. Update `docs/development-progress.md` and `docs/implementation-decisions.md`.
