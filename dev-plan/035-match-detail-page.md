# 035 Match detail page

**Feature:** A reusable server-rendered match analysis and result page.

**Depends on:** [018-match-card.md](018-match-card.md), [029-match-detail-api.md](029-match-detail-api.md), [031-public-response-cache.md](031-public-response-cache.md), [032-match-feed-page.md](032-match-feed-page.md).

**Source:** [App specification](../app-write-up.md), sections 2–4, 7–10, 12, 13 and 15.

## Prompt

Read `dev-plan/000-index.md`, the source sections and existing code. Implement `/en/matches/fixture-id/home-v-away` using the existing stored-data detail service. Fixture ID determines identity. Render meaningful HTML before hydration, including teams, kickoff, prediction, estimated probability and results. Use the shared shell, team rows, probability labels and outcome badges. An unknown fixture returns a real 404; a known fixture with missing predictions has an explicit unavailable state.

Show the current complete revision while a cycle is open, then its locked revision or closed-without-prediction state. For a void cycle retain its last prediction, if any, and explain the void reason even if no revision was locked. Never fill a missing family from an older snapshot. Show all four launch market families, available alternatives, source per family, original publication time and honest freshness/refresh status. Keep regulation scores separate from prediction outcomes and handle partial, pending, unavailable and corrected results explicitly.

Place two to four supported reasons and one key uncertainty after the principal prediction. Expose attributable source links and evidence/publication times; expandable sources are acceptable while core predictions stay visible. Treat source summaries as untrusted text, permit safe link schemes and never reveal prompts, internal reasoning, provider secrets or worker logs. Describe fallback accurately and retain limited-news/age disclosures. Display exact score only if the earlier recorded decision and validated data permit it.

Add a place for the next prompt's read-only history feature without implementing revision browsing here. Keep historical pages useful after the forward prediction window closes.

## Acceptance checks

- Inspect initial HTML and CSS for an open, locked, void, partial and unavailable fixture.
- Verify market sources/probabilities/explanations come from one selected snapshot and badges remain independent.
- Exercise unknown IDs, long names, narrow screens, zoom, broken images and unsafe source URLs.
- Open a match from a filtered, multi-page feed and go Back; confirm prompt 034 restores filters, loaded cards and scroll with this real destination.
- Confirm no public request triggers AI/provider work or requires visitor authentication.

## Handoff

Required: when this feature's implementation and acceptance checks are complete, update [dev-tracker.md](../dev-tracker.md) by ticking this file's row (☐ → ☑). Leave the checkbox empty while work or required checks remain incomplete.

Update `docs/development-progress.md` with changed files, checks/results and actual blockers; record necessary decisions in `docs/implementation-decisions.md`.
