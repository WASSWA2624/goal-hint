# 061 Server-side prediction gating

**Feature:** Gate prediction content on the server for viewers who are not entitled: one policy module, one gated-read module, explicit gated wire variants, oracle-filter refusal, generic metadata, private headers and a leak scan over every page, page-data and API response.

**Depends on:** [060-access-codes-periods.md](060-access-codes-periods.md), [028-match-feed-api.md](028-match-feed-api.md), [029-match-detail-api.md](029-match-detail-api.md), [031-public-response-cache.md](031-public-response-cache.md), [042-seo-discovery.md](042-seo-discovery.md).

**Source:** [App specification](../../app-write-up.md), sections 1–3, 11, 12 and 15 (version 1.9 paid access); [monetization plan](../../prompts/monetization.md), sections 3 (gating rule, seam, representation, switch, owner preview, oracle filters), 4, 5.5, 5.9, 8 (061) and 9 (paywall unit tests, leak scan).

## Prompt

Read `next-js/dev-plan/000-index.md`, the source sections and existing code before implementing this feature. With the switch `off` the site must behave as today apart from the `access` field and the generic metadata. The designed gated UI comes in 062; here every consumer the compiler flags gets a minimal neutral render.

- **Policy** (`src/domain/paywall.ts`, pure, the only place policy lives):
  - `isFreeFixture(status)`: finished (`isPlayedFinalStatus` in `src/domain/market-settlement.ts`), canceled or awarded. Everything else is gated, by status alone; postponed and abandoned stay gated because they can be replayed (`docs/schedule-lifecycle.md`).
  - `usesSubscriberFeedOracle(query)` on the **parsed** query: true when the probability range is not "any", `sort.by` is `probability`, `picks` is `only`, or `odds` is set.
  - `gateFeedResponse`, `gateDetailResponse` and `gateInsights`. Which families have a published pick stays visible (existence only, in policy order).
- **Wire schemas** (`src/domain/fixture-snapshot.ts`, `match-feed.ts`, `match-detail.ts`, `match-insights.ts`): rename the full cached types (`StoredMatchFeedResponse`, `StoredMatchDetailResponse`, …); the existing exported names become wire unions, so every consumer fails to compile until it handles gated data. The cache keeps parsing stored schemas; no projection bump.
  - `gatedForecastSchema`: `{ gated: true, runId, runSequence?, revisionId, publishedAt, provisional?, updateDelayed?, families }`; `families` is in `publicPolicy.markets` order and counts in the family-total invariant; `prices: []`.
  - `gatedDetailSnapshotSchema`: `{ gated: true, revisionId, cycleId, historical, applicability, publishedAt, families }`. The identity invariants in `src/domain/match-detail.ts:81` apply to both variants, market equality only to the full one. A gated detail omits `odds` and has `history: { gated: true }`.
  - Feed, detail and insights responses carry `access: { tier, signedIn }`. Never null out fields; never say "locked", which means cutoff-locked.
  - The gate keys on fixture status only: a gated fixture's `?cycle=` or `?revision=` snapshot is gated even when its current forecast is null (`src/server/matches/detail-service.ts:45-63`).
- **Gated reads** (`src/server/members/gated-reads.ts`): wrap `readPublicMatchFeed`, `readPublicMatchDetail`, `readPublicMatchInsights` and `readPublicSlipBuild` (signatures unchanged). Redact after the MySQL cache read and before serialization, so one cached body serves both tiers and the cache key has no viewer dimension. For free viewers, parse the output with the strict wire schema and throw `MatchFeedError("unavailable")` on failure (fail closed).
- **Factories:** `createFeedRoute`, `createMatchDetailRoute`, `createSlipsRoute`, `createMatchFeedHandler`, `createMatchDetailHandler` and `createMatchInsightsHandler` take an injectable raw reader and `resolveAccess` (`resolveViewerAccess` / `viewerAccessFromRequest` from 060), and always gate. Tests and fixtures inject raw readers only.
- **Leak points** (plan 5.5 table), server side:
  - feed records through the gated reads (`src/server/matches/public-feed.ts`, `fixture-read.ts`, `feed-http.ts`);
  - oracle filters: `MatchFeedError("subscription-required")` in `matchFeedErrorSchema` (`src/domain/match-feed.ts:59`), mapped by `publicMatchFailure` to 403, non-recoverable (`src/domain/feed-query.ts`, `src/server/matches/feed-read.ts`, `feed-error.ts`, `public-http.ts`); the feed page (`src/app/_components/feed-route.tsx`, `src/server/matches/feed-page.ts`) answers 307 to `serializeFeedQuery` with the oracle fields reset;
  - detail current, `?revision=` and `?cycle=` through `gateDetailResponse` (`public-detail.ts`, `detail-http.ts`); server-rendered history receives only gated data (`revision-history.tsx`, `match-detail-content.tsx`);
  - insights: `gateInsights` drops "Goal Hint analysis" news items (`src/server/matches/insights-read.ts:126-133`, `insights-service.ts`) for free viewers unless the fixture is free; the `loadPreview` prop in `src/app/_components/match-detail-route.tsx` is built from gated insights;
  - metadata: `matchDetailMetadata` (`src/server/matches/detail-page.ts`) always uses `detail.datedMetadataDescription` (or `metadataDescription` without a date), adds a subscriber line only when the mode is `on` and the fixture is not free, and stops using `forecastMetadataDescription` and `voidForecastMetadataDescription`;
  - indexability: `matchPageIndexable` (`src/domain/discovery.ts:43`) counts families from either variant, so match pages stay indexable;
  - slips (`src/server/slips/public-slips.ts`, `src/app/_components/slips-route.tsx`): no read for free viewers;
  - card and detail UI: gated `shownFamily` is the first eligible family in policy order, never `bestCardFamily`; never call `featuredFamily`, `bestPublishedFamily` or `noPickReason` on gated data; no values in `data-prediction`, `data-outcome`, `data-featured-pick` or `data-verdict`; no tooltip, odds, hidden pick text, counts or pick aria-labels;
  - client fetches: `credentials: "same-origin"` in `src/state/refresh-base.ts:19`; a 403 becomes `subscription-required` (`src/domain/feed-pagination-error.ts`), which triggers `router.refresh()`;
  - headers: `privateMatchHeaders` (`private, no-store`, `vary: Cookie`) for feed, detail and insights in `src/server/matches/public-http.ts`; `/api/performance` keeps `publicMatchHeaders`.
- **Policy fact:** `publicPolicy.access = "free-with-subscriber-predictions"` in `src/domain/public-policy.ts`; update `scripts/verify-seo-rendering.py:136-141`.
- **Unit tests** (`tests/paywall.test.mjs`): walk every gate output; no premium key or value for gated fixtures; a full record passed off as gated fails the wire parse; `usesSubscriberFeedOracle` cases; 403 JSON for `subscription-required`.
- **Leak scan** (`scripts/verify-paywall-rendering.py`, fixture `tests/helpers/rendering/paywall/`), as plan section 9 describes. The fixture injects raw scenario readers and a fake access resolver keyed by a test-only header, and mounts the real API handler factories.
  - Sentinels: probability 0.6173 (shown as "62%" and "61.73"), reason `SENTINEL-REASON-7Q`, uncertainty `SENTINEL-RISK-4K`, a unique selection.
  - Fixtures: scheduled; live; postponed with a void cycle; scheduled with a null forecast plus a prior cycle carrying sentinels; finished; canceled.
  - Viewers: (a) anonymous; (b) signed in, not unlocked; (c) entitled; (d) unlocked, period expired; (e) unlocked with a revoked code; (f) blocked account; (g) evicted device.
  - Fetch every page's **raw** HTML (not `visible_html()` from `scripts/lib/rendering.py`, which strips RSC flight scripts), the same URLs with `RSC: 1`, `/api/matches`, `/api/matches/{id}` with and without `?revision=` and `?cycle=`, the match page with `?cycle=`, `/api/matches/{id}/insights?section=news` and `/en/slips?build=1`; inspect `<head>` metadata, JSON-LD, `data-*` attributes and `aria-label`s.
  - Assert: (a), (b) and (d)–(g) contain no sentinel, no subscriber-only value and no probability-derived `data-market` or `data-featured-pick`; oracle keys get 307 or 403; (c) contains the sentinels, and free-fixture sentinels appear for everyone; anonymous responses have no `Set-Cookie`; `/admin`, `/en/account` and `/en/subscribe` are no-store and noindex. With the mode `off`, existing rendering checks pass except for the generic metadata.
- **Existing tests and fixtures:** update the tests that inject readers or assert headers (`device-feed-query`, `discovery` (176–195), `discovery.integration`, `feed-page`, `feed-page.integration`, `match-detail-metadata`, `match-detail-page`, `match-detail`, `match-detail.integration`, `match-feed`, `match-feed.integration`, `match-insights`, `revision-history-page`, `slip-service`, `detail-state` (47), `live-client-refresh` (108)) and the fixture pages under `tests/helpers/rendering/{seo,match-feed-detail,slips,match-feed,match-feed-live,match-card,client-state}` with `verify-match-feed-rendering.py`, `verify-match-card-rendering.py` and `verify-client-state-rendering.py`. They inject a full resolver; no prediction-content assertion is weakened.

**Files.** Plan section 5.5, plus new `src/domain/paywall.ts`, `src/server/members/gated-reads.ts`, `tests/paywall.test.mjs`, `scripts/verify-paywall-rendering.py` and `tests/helpers/rendering/paywall/`; changed `src/domain/public-policy.ts`, `scripts/verify-seo-rendering.py` (136–141), the tests and fixture pages listed above, and `package.json` (`test:paywall`, `test:paywall:rendering`).

## Acceptance checks

Run `npm test`, `npm run typecheck`, `npm run test:paywall`, `npm run test:paywall:rendering`, `npm run test:card:rendering`, `npm run test:state:rendering`, `npm run test:feed-page:rendering`, `npm run test:live-client:rendering`, `npm run test:detail-page:rendering`, `npm run test:history-page:rendering`, `npm run test:seo:rendering` and `npm run test:slips:rendering`.

- Mode `off` equals today apart from `access` and the generic metadata.
- With mode `on`, viewers (a), (b) and (d)–(g) get no pick, probability, reason, alternative, price or analysis item for unfinished fixtures in any page, RSC or API response.
- Free fixtures are unchanged, and one cache entry serves both tiers.
- Match pages stay indexable.
- Oracle queries get 307 or 403 JSON (not 500).
- No prediction-content assertion is weakened.

## Handoff

Required: when this feature's implementation and acceptance checks are complete, update [dev-tracker.md](../dev-tracker.md) by marking this file's row ☑ Completed. While work or required checks remain incomplete, mark it ◐ Partial once implementation has started, and leave it ☐ Not started until then.

Update `docs/development-progress.md` with changed files, checks and results, and actual blockers. Record justified implementation choices in `docs/implementation-decisions.md`.
