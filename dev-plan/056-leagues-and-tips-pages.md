# 056 Leagues and tips pages

**Feature:** The Leagues and Tips sections from the layout templates.

**Depends on:** [042-seo-discovery.md](042-seo-discovery.md), [051-feed-screen-layout.md](051-feed-screen-layout.md), [061-prediction-gating-server.md](061-prediction-gating-server.md), [062-gated-ui-entry-points.md](062-gated-ui-entry-points.md).

**Source:** [App specification](../app-write-up.md), sections 2 and 12 (version 1.8; version 1.9 paid access) and the [layout templates](templates/).

## Prompt

Leagues: a searchable directory of covered competitions grouped by country, with logos and upcoming fixture counts, each linking to the feed filtered to that league. Tips: today's highest shown-pick probabilities across all markets, with outcomes for finished matches and a link to performance. Both use stored data only, are crawlable, and join the desktop navigation and phone tab bar.

Tips is subscriber-only for unfinished fixtures. It reads through the gated reads (`src/server/members/gated-reads.ts`) and policy from `src/domain/paywall.ts`. Free viewers never get a probability-ordered list of unfinished fixtures: no ranking, order, count or selection that reveals picks. They see the gated panel with Get access and "Have a code?" (062), plus finished, canceled and awarded fixtures with their picks and outcomes. Page metadata stays generic.

## Acceptance checks

- Indexing follows the discovery policy; filtered feed links stay non-canonical.
- Tips never imply guaranteed outcomes and show each pick's market and source.
- With paid access on, Tips HTML, page data and any API response for anonymous and non-entitled viewers contain no pick, probability or probability-derived order of unfinished fixtures; extend `scripts/verify-paywall-rendering.py` to cover the page.

## Handoff

Required: tick this row in [dev-tracker.md](../dev-tracker.md) only when implementation and checks are complete. Update `docs/development-progress.md` and `docs/implementation-decisions.md`.
