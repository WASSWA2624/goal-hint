# Match details screen

`/{locale}/matches/{fixtureId}/{slug}` uses a desktop match workspace and a compact
mobile layout. Both use the same information panels. Rows can open nested item views:

**Match details → section → item** (for example `Match details / Head to Head / Arsenal v Liverpool`).

## Layout

| Width | Layout |
| --- | --- |
| Below 64rem | Compact branded header with contextual Back, scoreboard, Verdict or replay card, and a horizontally scrolling information tab strip. An unscoped URL opens Team Stats. |
| Desktop (≥ 64rem) | A sidebar and section pane scroll independently below the shared header and progress bar. Match Details is the first and default item. Its scoreboard and Top Predictions have no repeated visible page title. Site footer links follow the content inside the right pane. |

Desktop navigation continues with Match Statistics, Match Events, Lineups,
Form & H2H, Standings, Players, Markets & Odds, Analysis, News & Insights,
Match Info, Referees and Pick History. The selected link names its section.
The mobile tab strip keeps arrow-key and Home/End navigation. Section selection,
filters and items are addressable. Refresh and Back/Forward restore URL state.
Legacy section and market links still resolve to their corresponding panels.

Top Predictions uses the featured pick and up to four additional ranked published
selections. Markets & Odds keeps the full supported market list, its disclosures,
and authorized bookmaker comparisons. Analysis owns reasons, uncertainty and sources.
Pick History keeps revision and cycle comparisons. Match Statistics and Match Events
own provider observations. Match Info keeps competition, venue, recovery time and
nearby fixtures. Desktop lineups share one
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
Desktop visitors and unsubscribed members can see the public fixture facts and
use the account-appropriate access controls, with existing registration, sign-in,
subscription and referral destinations. Earned referral entitlement uses the
same full-access tier as paid entitlement. Completed fixtures are public.
Unfinished predictions and section insights remain redacted/denied by the
existing server services. Restricted panels make no insight requests.

## URL state

Section selection and drill-downs use browser history. Inline market expansion, filters,
categories, search and pagination replace the current entry. Market search filters while typing
and writes `mq` after a short pause. Unknown or invalid values fall back to defaults.
Revision-history parameters are preserved, including when returning to the current scoreboard.

| Key | Meaning |
| --- | --- |
| `panel` | `details`, `stats`, `events`, `lineups`, `form`, `standings`, `players`, `markets`, `analysis`, `news`, `venue`, `referee`, `history`. `details` selects the desktop overview and falls back to Team Stats on mobile. `h2h` is a legacy alias within Form & H2H. |
| `section` | `stats`, `h2h`, `form`, `lineups`, `players`, `news`, `injuries`, `context`, `referee`, `history` |
| `item` | Item inside the open section: a fixture id, `home-{playerId}`/`away-{playerId}`, a news id or a metric |
| `tab` | Section control: lineup detail mode, player position group, injury status or news type |
| `team`, `venue`, `window`, `comp`, `page` | Section filters and page |
| `market`, `mcat`, `mq`, `mk=closed` | Market panel, category, search text, collapsed All Markets & Odds |

The page route removes these keys before validating the history keys (`revision`, `cycle`, `limit`
and anchors), so a match URL with view state never becomes a 404.

## Data

- **Predictions and markets:** `/api/matches/{id}` supplies the current published or locked projection,
  the applicable retrospective replay, and eligible prices. Featured identity uses the existing
  decision and fallback logic. Additional summary picks use the shared forecast ranking. Full
  market rules, display and access are documented in [Markets and display](../../implementation-docs/markets-and-display.md).
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
- **Mobile Back:** the feed stores its current URL in session storage so the mobile Back control can
  return to the filtered feed. The desktop sidebar manages match sections and ordinary browser
  Back still follows navigation history.

## Known data gaps (shown as "Not available")

- Forecast and bookmaker coverage depend on the available stored publication, display rights and viewer access.
- Weather, venue pitch dimensions and surface, and officiating statistics may be unavailable.
  Venue, referee assignment and partial home/away positions display only when
  their verified stored projections exist; missing fields are explicit. A
  two-team standings projection is labeled partial and never presented as a
  complete league table.
- Player details, lineups and injuries depend on verified stored evidence. Lineups keep a complete
  starter list when the provider has supplied insufficient positions for a pitch diagram.
- Form and head-to-head use stored verified regulation results only, so a new database shows few or
  none until results accumulate.
  Desktop head-to-head filters exact team pairs across competitions, shows up
  to 20 available meetings, and offers a three-year history window. Dates include
  the year. Sample records from the design studio are never production data.
