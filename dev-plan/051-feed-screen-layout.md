# 051 Feed screen layout

**Feature:** Mobile and desktop feed screens reproducing the [layout templates](templates/).

**Depends on:** [050-feed-query-extensions.md](050-feed-query-extensions.md), [018-match-card.md](018-match-card.md), [032-match-feed-page.md](032-match-feed-page.md).

**Source:** [App specification](../app-write-up.md), sections 2–3 and 13 (version 1.8), `templates/feed-mobile.webp` and `templates/feed-desktop.webp`.

## Prompt

Read `dev-plan/000-index.md`, the source sections and existing code before implementing this feature. Reproduce the template layouts; theme tokens and stored data supply branding and content.

Phones (below 64rem): page title and subtitle with a search button; a compact filter card with a 1D/Range toggle, date field and previous/next stepper; one scrolling chip row each for markets, leagues and countries, each with a chevron opening a searchable checklist; odds and probability selects with Reset; a count with sort and reverse; compact cards (league, date and time; teams with a VS or live/final score; market chip with pick and a percent pill); and a fixed bottom tab bar.

Desktops: a top bar with navigation, a More menu and search that keeps the current filters; a title row with a date-range picker and quick presets; a filter panel with Date, Leagues, Countries and Markets blocks, odds and probability range sliders, Apply Filters showing the draft's live match count, and Clear All; a "Predicted Matches" header with sort; a table with #, Date & Time, League, Home, score, Away, Market, Prediction and Probability bar columns; and `‹ 1 2 3 4 … N ›` pagination. Use a compact column set between 64 and 80rem.

Chips are ordinary links, so filters work without JavaScript; desktop edits stay drafts until Apply. Row numbers continue across pages. Keep one keyboard destination per card or row, accessible names for every icon control, and visible focus. Use a colourful accent palette: one hue per filter, market family and section, plus gradient actions, keeping 4.5:1 text contrast (3:1 for large text on gradients). Controls the data cannot support yet (odds) appear disabled with an explanation until their prompt lands.

## Acceptance checks

- Compare 320, 375, 400, 430, 768, 1024, 1280 and 1440 px renders with the templates: no horizontal scroll, compact vertical rhythm and stable columns.
- Verify keyboard paths, focus rings, screen-reader names, reduced motion and the no-JavaScript chip links.
- Verify numbering continuity on later pages and the page sequence near the start, middle and end.

## Handoff

Required: when this feature's implementation and acceptance checks are complete, update [dev-tracker.md](../dev-tracker.md) by ticking this file's row (☐ → ☑). Leave the checkbox empty while work or required checks remain incomplete.

Update `docs/development-progress.md` with changed files, checks and results, and actual blockers. Record justified implementation choices in `docs/implementation-decisions.md`.
