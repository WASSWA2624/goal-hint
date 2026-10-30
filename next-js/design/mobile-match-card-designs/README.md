# Compact mobile match cards

Ten review-only options for a future shared mobile match card in Matches,
Cards and Slips. No option is selected or applied to production.

## Review of the current cards

Reviewed the production `MatchCard`, `MatchCardList`, `cleanLedgerIdentityStyles`
and slip `CleanLedgerSelection`, plus the rendered match-card acceptance app
at phone width.

- The mobile feed and slip selections share the Clean ledger identity: kickoff
  and competition, mirrored teams, then market/pick/odds/probability.
- Metadata and field labels are 10px. The inline `Mkt`, `Pick`, `1X2` and `1`
  notation saves space but makes the forecast less explicit.
- Mirrored teams divide the available width into two small slots. Long names
  use compact labels; their complete accessible names remain available.
- Progress/outcome follows the facts on a separate row. The rendered current
  example was 109px high at a 375px viewport, with synthetic teams and a result.
- Desktop uses the separate Aligned ledger renderer. The approved slip headers,
  disclosure controls and desktop rows do not need to change for this review.

The concepts preserve the same match facts, use readable market/pick wording,
allow full team names to wrap, and compare different information arrangements.
They do not treat estimated probability as certainty or substitute new picks
when changing the display context.
At narrow widths, long-name fixtures stack the two names and omit decorative
crests to avoid splitting long words into tiny fragments.

## Options

| Option | Layout |
| --- | --- |
| Balanced lines | Kickoff/league, mirrored teams, prediction with labeled figures. |
| Team stack | Two left-aligned team rows beside the prediction and figures. |
| Prediction rail | A leading forecast column beside teams and numerical facts. |
| Kickoff column | Date/time in a dedicated column, with the fixture alongside. |
| Market band | A tinted lower strip groups the prediction, odds and chance. |
| Fact grid | Four explicit cells for market, prediction, odds and estimated chance. |
| Open ledger | Borderless rows with left-aligned names and inline facts. |
| Chance column | A probability column and small meter beside the fixture/pick. |
| Scoreboard | Small team crests around a central VS or supplied score/phase. |
| Pick first | A forecast band leads, followed by the fixture and kickoff. |

## Compare in a browser

From `next-js/`:

```text
python scripts/preview-mobile-match-card-designs.py --serve
```

Open `http://127.0.0.1:4393/`. Use the design picker or arrows, or enable
**Compare all 10**. Preview settings provide Matches/Cards/Slips contexts,
320/375/430px widths, light/dark appearance, and typical, long-name, live,
completed and other-state samples. The browser measures the first card's
actual height and width. The chosen width is a maximum; narrow browser windows
shrink it to fit. Settings are retained in the URL, for example:

```text
http://127.0.0.1:4393/?design=market-band&context=Slips&sample=Long+names&width=320&appearance=dark
```

Tap a card or use Enter/Space to reveal full illustrative match information.
Expanded cards retain their local state when switching designs or settings.
The Slips context is a simple expanded container for inspecting match rows,
not a redesign of the approved production slip header.

The same authored fragment runs in the chat's native named variant carousel.
Its shared design controls select the sample, context and phone width. The host
owns navigation and appearance. The browser shell supplies its own navigator.

## Scope and verification

All fixtures and predictions are illustrative, dated 30–31 October 2026.
Kickoff displays explicitly use EAT for consistent comparison. Crests are
generic initials. Other-state examples cover a locked pick, no published pick,
an unknown kickoff, missing odds, double chance and a postponed fixture. Locked
samples omit the forecast/metrics from their DOM; these are visual examples,
not an authentication implementation. The shared renderer owns the data,
formatting and local card interactions for all ten layouts.

Colors follow the production light/dark palette. Square match-card frames and
the existing semantic small/control corner values follow the repository's
radius guidance. The local browser uses the bundled Manrope font and needs no
network resources. The inline copy uses an allowlisted font stylesheet with a
local fallback.

Browser verification covered 900 layout/settings combinations (2,700 cards):
ten designs × five samples × three contexts × three actual phone viewports ×
two appearances. It checked text bounds, information-block overlap, card/page
overflow, scores, unavailable data and unique IDs. All passed with no runtime
errors. Card expansion, keyboard activation, preserved expansion and URL
restoration also passed. These checks validate the review, not production
forecasting, access control or API integration.
The inline carousel also passed a complete ten-option navigation cycle and
shared context/width/theme updates. Python and both JavaScript sources passed
syntax checks; the literal inline fragment passed its size/structure checks.

Run without `--serve` to regenerate the standalone document; `--port` chooses
another local port. Generated documents, fonts and browser captures remain in
ignored `output/`. Production routes, components, business logic and Flutter
are unchanged. Implement the chosen card in the existing shared mobile
presentation after selection.
