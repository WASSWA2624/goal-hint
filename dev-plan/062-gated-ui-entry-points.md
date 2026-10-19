# 062 Gated UI, transitions and entry points

**Feature:** The designed subscriber-only states of the card, verdict, drawers, slips, filters and feed banner; the account icons; large buttons and a segmented choice; and tier-aware pagination, polling and insights.

**Depends on:** [061-prediction-gating-server.md](061-prediction-gating-server.md), [051-feed-screen-layout.md](051-feed-screen-layout.md), [037-live-client-refresh.md](037-live-client-refresh.md).

**Source:** [App specification](../app-write-up.md), sections 2, 3 and 13 (version 1.9 paid access); [monetization plan](../prompts/monetization.md), sections 2 (step 1), 5.5 (card, detail UI, client fetches, live merge and pagination), 5.8 (Back after sign-out), 6 (entry points, controls, copy) and 8 (062).

## Prompt

Read `dev-plan/000-index.md`, the source sections and existing code before implementing this feature. Replace 061's neutral renders with the designed states; the gated data contract does not change.

- **Card** (`src/components/match/match-card.tsx`, `src/domain/match-card.ts`): the pick line is plain "Pick for subscribers" with a new `SubscriberIcon` (star or key) and the name of the first eligible family in policy order; never a padlock or "Locked prediction". The tile still opens the match and the card stays about 75 px tall. No pick attributes, tooltip, odds or hidden text.
- **Feed banner** for free viewers: "Picks are for subscribers · Get access", linking to `/en/subscribe`.
- **Verdict gated panel** (`src/components/match/details/verdict.tsx`): "Picks and probabilities for this match are for subscribers. From UGX {price} for {days}.", with a plural-aware day count, using the cheapest active plan ("From UGX 1,000 for 1 day."), with two buttons that always show: "Get access" and "Have a code?" (to `/en/account` with `return` = this match).
- **Markets, Analysis and History drawers** (`markets-card.tsx`, `analysis-drawer.tsx`, `src/app/_components/revision-history.tsx`): one plain line each. **Slip builder** (`src/components/slips/slip-builder.tsx`, `slip-table.tsx`): an `EmptyState` with Get access.
- **Feed filters:** the probability range, probability sort and picks-only are disabled with "Subscribers only" (`src/components/match/feed-filters.tsx`, `feed-controls.tsx`, sort options at `feed-header.tsx:163`).
- **Account icon:** a new `UserIcon` in `src/components/ui/icons.tsx`, labelled "Account" and linking to `/en/account`, beside `ThemeToggle` in `HeaderActions` (`src/app/_components/public-shell.tsx:78`), `AppBrandBar` (`src/components/navigation/app-brand-bar.tsx:47`, both buttons in a flex group) and the match `PhoneBar` (`src/components/match/details/match-details.tsx:55`, a fourth 2rem column). It shows only when the mode is `on`, through a `showAccount` prop from routes that already resolve access. Information pages show no icon and stay free of database reads. No new tab-bar item.
- **Controls** (`src/components/ui/controls.tsx`): a `size="large"` option on `Button` and `ButtonLink` (3rem, body font) for Get access and the approve button; phone buttons are 2.25rem today (`theme.control.compactHeight`, `src/styles/theme.ts:274`). `SegmentedChoice`: two 3rem buttons (`choice-picker.tsx` is a small dropdown and does not fit).
- **Transitions:** a different `access.tier` raises `FeedPaginationError("changed")` and `router.refresh()`; provider keys include the tier; `sameCardFixture` compares the variant (`src/domain/fixture-reconciliation.ts`, `live-refresh.ts`, `feed-pagination.ts:35-60`, `match-card.ts`, `src/app/_components/feed-surface.tsx:158`, `src/components/match/live-match-detail.tsx:65`, `src/state/detail-api.ts`). Unlocking reveals picks; expiry hides them on the next poll. Back after sign-out shows no picks: no-store pages plus a `pageshow` reload from the back/forward cache.
- **Presentation helpers** (`src/domain/match-details.ts`, `feed-presentation.ts`, `detail-presentation.ts`): gated data never reaches `featuredFamily`, `bestPublishedFamily` or `noPickReason`; no counts or pick aria-labels.
- **Copy:** `paywall.*` keys in `src/i18n/messages/en.ts`, with `{price}` and a plural-aware `{days}`. Short sentences; "subscriber" and "gated", never "locked"; no accuracy, win-rate, ROI or "sure win" claims.

**Files.** Section 6 entry points (`public-shell.tsx`, `app-brand-bar.tsx`, `match-details.tsx`); `match-card.tsx`, `verdict.tsx`, `markets-card.tsx`, `analysis-drawer.tsx`, `revision-history.tsx`, `src/components/slips/slip-builder.tsx`, `slip-table.tsx`, `feed-filters.tsx`, `feed-controls.tsx`, `feed-header.tsx`, `feed-surface.tsx`, `live-match-detail.tsx`, `feed-pagination.ts`, `fixture-reconciliation.ts`, `live-refresh.ts`, `match-card.ts`, `match-details.ts`, `feed-presentation.ts`, `detail-presentation.ts`, `controls.tsx`, `icons.tsx`, `en.ts`.

## Acceptance checks

Run `npm test`, `npm run typecheck`, `npm run test:card`, `npm run test:live-client`, `npm run test:state`, `npm run test:card:rendering` and `npm run test:paywall:rendering`.

- Unit: a tier change yields the refresh signal; `sameCardFixture` is false when only the variant changes; gated card props carry no pick attributes; tier-mismatched pages throw `changed`.
- Rendering scan: no probability-ranked `data-market`, no `data-featured-pick` or `data-verdict` values, and a banner that links to `/en/subscribe`.
- Manual: the card stays about 75 px at 320–375 px and the tile opens the match; unlocking reveals picks; expiry hides them on the next poll; Back after sign-out shows no picks; from an active device, Account → Renew reaches the plan step in 2 taps.

## Handoff

Required: when this feature's implementation and acceptance checks are complete, update [dev-tracker.md](../dev-tracker.md) by marking this file's row ☑ Completed. While work or required checks remain incomplete, mark it ◐ Partial once implementation has started, and leave it ☐ Not started until then.

Update `docs/development-progress.md` with changed files, checks and results (including manual checks), and actual blockers. Record justified implementation choices in `docs/implementation-decisions.md`.
