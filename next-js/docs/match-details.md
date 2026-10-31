# Match details screen

`/{locale}/matches/{fixtureId}/{slug}` uses the approved Touchline design on desktop:
home and away teams, one featured prediction or access panel, then eight information tabs.
Phones retain their section drawers. Rows can open nested item panels:

**Match details → section → item** (for example `Match details / Head to Head / Arsenal v Liverpool`).

## Layout

| Width | Layout |
| --- | --- |
| Phones (< 22rem) | One column. Phone header with back and search; banner, featured pick, 2×2 market tiles, All Markets & Odds, then cards. |
| Phones and tablets (22–64rem) | Market tiles 2×2 (4 across from 48rem); cards two-up. An opened section spans the full width in place. Referee spans the row when it would otherwise sit beside an empty cell. The opened history drops its own frame inside the card. |
| Desktop (≥ 64rem) | Touchline scoreboard, featured prediction, and sticky horizontal tabs. Comparison and recent results share a two-column workspace from 75rem. Other tabs own their content without repeated summary cards. |

The tabs are Statistics & form, Head-to-head, Standings, Lineups, Other markets,
Match events, Venue & officials, and Analysis & news. Arrow keys and Home/End
move through the tab list. The selected tab, filters and item are addressable;
refresh and Back/Forward restore them. Legacy section and market links resolve
to their corresponding tab. Revision history is in the Analysis tab.

The featured selection is excluded from the desktop market list. Its reasons
and uncertainty belong to Analysis. Current match statistics and event lists
are presented in their respective tabs. Venue omits competition, score,
standings and recent results already owned elsewhere. Desktop lineups share one
horizontal pitch: home players defend the left goal, away players defend the
right, with both formations and confirmed status beside the team names. A bounded
105 × 68 reference field uses [IFAB Law 1 marking dimensions](https://theifab.com/laws/latest/the-field-of-play/)
and uniform scaling; its geometry is not a measurement of this fixture's venue.
Provider formation rows are rotated onto each team's own half. Full names, shirt numbers and player profiles
remain visible; the position detail mode adds stored positions to the same
markers. The pitch replaces the repeated starter list only when every visible
starter has a unique, valid formation coordinate consistent with the supplied
formation. Otherwise complete starter lists remain visible. Position codes are
expanded to readable roles; specific roles are preserved only when supplied.
Substitutes sit alongside the pitch on wider desktops and below it on narrower
screens; team-sheet timestamps
and unavailable profile/manager fields are in one expandable details disclosure.
When the provider update time is missing, the retrieval timestamp is labelled
as retrieved rather than presented as an update.
The compact scoreboard, prediction attribution and tab spacing bring the active
content higher on desktop while retaining readable names and controls.

Desktop visitors and unsubscribed members can open the match shell and one
account-appropriate access panel, with existing registration, sign-in,
subscription and referral destinations. Earned referral entitlement uses the
same full-access tier as paid entitlement. Completed fixtures are public.
Unfinished predictions and section insights remain redacted/denied by the
existing server services; restricted tabs return focus to the shared access
panel and make no insight requests. Phone access presentation is unchanged.

## URL state

The view is addressable, survives refresh and supports Back/Forward. Opening or closing a section,
item or market adds a history entry; tabs, filters, categories, search and pages replace the current
entry. Market search filters as you type and writes `mq` after a 300 ms pause; Back/Forward restore
it. Unknown or invalid values fall back to defaults. Revision-history parameters are preserved.

| Key | Meaning |
| --- | --- |
| `panel` | Desktop tab: `stats`, `h2h`, `standings`, `lineups`, `markets`, `events`, `venue`, `analysis` |
| `section` | `stats`, `h2h`, `form`, `lineups`, `players`, `news`, `injuries`, `context`, `referee`, `history` |
| `item` | Item inside the open section: a fixture id, `home-{playerId}`/`away-{playerId}`, a news id or a metric |
| `tab` | Section control: lineup detail mode, player position group, injury status or news type |
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
  RTK Query `insights` endpoint (`state/detail-api.ts`; deduplicated, reused for ten minutes). No
  request is made when a preview under five minutes old already holds the whole section (lineups and
  context always; the other lists when their totals fit the preview). Concurrent section requests
  for one fixture share one stored read on the server. Opening a section never starts a prediction
  job or a provider request.
- **Live refresh:** `GET /api/matches/{id}` every 20 seconds while the match is live, the daily run
  is updating, or a scheduled kickoff is within 30 minutes of the last read; 60 seconds otherwise. A
  poll re-renders the page only when something shown changed.
- **Back link:** the feed stores its current URL in session storage; the match page returns to it so
  the visitor's filters are kept.

## Known data gaps (shown as "Not available")

- Bookmaker odds are not shown: odds show as `—`, with no comparison, movement or value. Prompt 052
  imports them privately, but display rights are unconfirmed (OP-36), so
  `publicPolicy.features.providerOdds` is off and the detail response's `odds` envelope and
  `fixture.prices` stay empty. Turning display on needs a recorded owner decision and a UI prompt
  that labels market-implied probabilities separately from estimated probabilities
  ([match-detail-api.md](match-detail-api.md), [provider-odds.md](provider-odds.md)).
- Only the four published families exist; other categories (draw no bet, handicaps, corners, cards,
  halves, correct score, clean sheets, specials) say no markets are published.
- A full competition table, weather, pitch dimensions/surface and officiating statistics are not collected.
  Venue, referee assignment and partial home/away positions display only when
  their verified stored projections exist; missing fields are explicit. A
  two-team standings projection is labeled partial and never presented as a
  complete league table.
- Player season statistics, ratings, portraits and managers are not collected; players, lineups and
  injuries come only from permitted evidence in the prediction's snapshot (often empty while AI and
  research are disabled).
- Form and head-to-head use stored verified regulation results only, so a new database shows few or
  none until results accumulate.
  Desktop head-to-head filters exact team pairs across competitions, shows up
  to 20 available meetings, and offers a three-year history window. Dates include
  the year. Sample records from the design studio are never production data.
