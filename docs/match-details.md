# Match details screen

`/{locale}/matches/{fixtureId}/{slug}` shows one fixture as an overview of compact cards. Every card
opens its complete section inside the page, and rows inside a section open nested item panels:

**Match details → section → item** (for example `Match details / Head to Head / Arsenal v Liverpool`).

## Layout

| Width | Layout |
| --- | --- |
| Phones (< 22rem) | One column. Phone header with back and search; banner, featured pick, 2×2 market tiles, All Markets & Odds, then cards. |
| Phones and tablets (22–64rem) | Market tiles 2×2 (4 across from 48rem); cards two-up. An opened section spans the full width in place. |
| Small desktop (64–80rem) | Desktop header and "Back to Predictions"; cards three-up. |
| Wide desktop (≥ 80rem) | Reference grid: All Markets & Odds on the left over three rows; Team Comparison and Head to Head; Team Form, Lineups and Players; News, Injuries, Match Context and Referee. An opened section moves to the top of the grid at full width. |

## URL state

The view is addressable, survives refresh and supports Back/Forward. Opening or closing a section,
item or market adds a history entry; tabs, filters, categories, search and pages replace the current
entry. Unknown or invalid values fall back to defaults. Revision-history parameters are preserved.

| Key | Meaning |
| --- | --- |
| `section` | `stats`, `h2h`, `form`, `lineups`, `players`, `news`, `injuries`, `context`, `referee`, `history` |
| `item` | Item inside the open section: a fixture id, `home-{playerId}`/`away-{playerId}`, a news id or a metric |
| `tab` | Section tab: player position group, injury status or news type |
| `team`, `venue`, `window`, `comp`, `page` | Section filters and page |
| `market`, `mcat`, `mq`, `mk=closed` | Market panel, category, search text, collapsed All Markets & Odds |

The page route removes these keys before validating the history keys (`revision`, `cycle`, `limit`
and anchors), so a match URL with view state never becomes a 404.

## Data

- **Markets, featured pick, tiles:** the applicable revision of `/api/matches/{id}` (four families:
  1X2, double chance, over/under 2.5, BTTS). The featured pick is the highest stored selected
  probability. Probability, odds and source are labelled separately; no confidence or value rating
  is shown.
- **Section previews:** one cached stored read (`createMatchInsightsService`) at page render,
  truncated by `insightsPreview` with complete totals. A failed read leaves each section with its own
  retry.
- **Full sections:** `/api/matches/{id}/insights?section=…`, loaded on first expansion through the
  RTK Query `insights` endpoint (deduplicated, reused for ten minutes). Opening a section never starts
  a prediction job or a provider request.
- **Back link:** the feed stores its current URL in session storage; the match page returns to it so
  the visitor's filters are kept.

## Known data gaps (shown as "Not available")

- Bookmaker odds are not imported: odds show as `—`, with no comparison, movement or value.
- Only the four published families exist; other categories (draw no bet, handicaps, corners, cards,
  halves, correct score, clean sheets, specials) say no markets are published.
- Venue, weather, standings, referee and officiating statistics are not collected.
- Player season statistics, ratings, portraits and managers are not collected; players, lineups and
  injuries come only from permitted evidence in the prediction's snapshot (often empty while AI and
  research are disabled).
- Form and head-to-head use stored verified regulation results only, so a new database shows few or
  none until results accumulate.
