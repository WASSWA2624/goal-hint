# 056 Leagues and tips pages

**Feature:** The Leagues and Tips sections from the layout templates.

**Depends on:** [042-seo-discovery.md](042-seo-discovery.md), [051-feed-screen-layout.md](051-feed-screen-layout.md).

**Source:** [App specification](../app-write-up.md), sections 2 and 12 (version 1.8) and the [layout templates](templates/).

## Prompt

Leagues: a searchable directory of covered competitions grouped by country, with logos and upcoming fixture counts, each linking to the feed filtered to that league. Tips: today's highest shown-pick probabilities across all markets, with outcomes for finished matches and a link to performance. Both use stored data only, are crawlable, and join the desktop navigation and phone tab bar.

## Acceptance checks

- Indexing follows the discovery policy; filtered feed links stay non-canonical.
- Tips never imply guaranteed outcomes and show each pick's market and source.

## Handoff

Required: tick this row in [dev-tracker.md](../dev-tracker.md) only when implementation and checks are complete. Update `docs/development-progress.md` and `docs/implementation-decisions.md`.
