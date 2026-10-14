# Squad group inventory: Lineups, Players, Injuries & Suspensions (phone, 375px)

Read-only inventory of three match-details section views on GoalHint as they work today. It is the
input for five mobile samples per screen, judged on Uniformity, Simplicity, Accessibility, Easy
navigation and Short flows. **Do not invent content or features.** Every label below is quoted from
`src/i18n/messages/en.ts`. The populated values come from the data shapes in code
(`src/domain/match-insights.ts`, `src/server/matches/insights-read.ts`). The local database has no
squad evidence, so the reference screenshots only show the empty states.

Screen ids: `lineups`, `players`, `injuries`. Each screen has three layers:

1. **Overview card** (closed). This is a compact card on the Match details overview.
2. **Opened section view**. It opens in place inside the same card, which then spans the full width.
3. **Player details item panel**. This nested view is shared by all three sections and replaces the
   list inside the opened card.

Primary source files:

- `src/components/match/details/squad-sections.tsx` (all three sections plus the shared `PlayerPanel`)
- `src/components/match/details/section-card.tsx` (`SectionCard`, `ItemPanel`, `useReturnFocus`)
- `src/components/match/details/details-ui.tsx` (card, header, chips, pager, rows, pills, facts, states)
- `src/components/match/details/use-match-view.ts` (URL state, lazy section fetch)
- `src/domain/match-view.ts` (URL keys), `src/domain/match-insights.ts` (data schema),
  `src/domain/match-insight-presentation.ts` (preview truncation, paging), `src/domain/match-details.ts`
  (player keys, position groups, pitch rows)
- `src/components/match/details/match-details.tsx` (page frame, grid order, phone header)
- `docs/match-details.md` (product contract)

---

## 0. Shared context for all three screens

### 0.1 Where the cards sit on the Match details page at 375px

Route: `/{locale}/matches/{fixtureId}/{slug}`. You reach it by tapping a match card in the predictions
feed (home `/en`, `/en/predictions/{date}`, or the Live and Results tabs).

The page runs top to bottom (`match-details.tsx:236-255`):

1. **Phone bar** (`PhoneBar`, `match-details.tsx:42-56`, 3.25rem tall, navy `#102A3A`, teal 2px bottom
   edge, **not sticky**):
   - `‹` back link, aria-label "Back to matches". It returns to the stored feed URL (`match-details.tsx:188`).
   - Centred title "Match details".
   - Theme toggle ("Switch to dark theme" / "Switch to light theme").
   - Search button ("Search matches" / "Close search"). It opens a form with placeholder
     "Search teams, leagues…" and a "Search" submit button.
2. **Match banner**: competition, date and time (EAT), crests, `VS` or score, and the "Top pick" box.
3. **2×2 market tiles**: 1X2, DC, O/U 2.5, BTTS.
4. **All Markets & Odds** card, full width and **expanded by default** (`match-view.ts:19,35`).
5. **Card grid** (`match-details.tsx:124-154`): one column below 22rem, **two-up at 375px**,
   `grid-auto-flow: row dense`. Cards in DOM order, with their phone rows when nothing is open:

   | Row | Left | Right |
   | --- | --- | --- |
   | 1 | Team Comparison | Head to Head |
   | 2 | Team Form | **Lineups** |
   | 3 | **Players** | News & Insights |
   | 4 | **Injuries & Suspensions** | Match Context |
   | 5 | Referee (full width) | |
   | 6 | Prediction History (full width) | |

6. **Page disclaimer** (`match-details.tsx:254`): "Estimated probabilities are not guarantees and are
   not betting advice. Opening a section reads stored data; it never starts a new prediction."
7. **Footer**: "© 2026 Goal Hint", links Help · Privacy · Terms · Contact, and the note "Estimated
   probabilities, not guarantees. No betting advice."
8. **Fixed bottom tab bar** (`shell-styles.tsx:348-357`, aria-label "App sections", navy, about 42px
   plus safe area). Tabs: "Matches" (active), "Live", "Results", "Slip builder", "Help", "More". The
   bar has adaptive overflow, so narrower widths show only Matches · Live · Results · More (reference
   `07-detail-finished-light.jpg`).

Card geometry at 375px:

- Gutter is 16px, so the content width is 343px.
- Two-up cards are 167.5px each with an 8px gap.
- Card padding is `9px 8px 10px` plus a 1px border, so a closed card's inner (container) width is about
  **149px (9.3rem)**.
- An opened card spans `1 / -1`, giving an inner width of about **325px (20.3rem)**
  (`details-ui.tsx:53-68`, `match-details.tsx:132`).

These widths drive the container queries:

| Container query | Threshold | Closed card (≈149px) | Opened card (≈325px) |
| --- | --- | --- | --- |
| Header meta text (`details-ui.tsx:101`) | hidden ≤ 16rem | Hidden | Shown |
| Lineups mini-pitch (`squad-sections.tsx:80`) | shown ≥ 15rem | Hidden | Not used |
| `Facts` two columns (`details-ui.tsx:425`) | ≥ 18rem below desktop | n/a | Two columns |

### 0.2 Shared card anatomy (`SectionCard`, `section-card.tsx:13-51`)

**Closed state**, top to bottom:

1. **Header**: `h2` containing one disclosure `button` (`CardHeader`, `details-ui.tsx:122-134`), with
   `aria-expanded` and `aria-controls="section-{id}"`. Its contents:
   - `IconBadge`, a 20×20 square in the accent soft fill with the accent-solid icon.
   - Bold title at 13px. Two-up phone titles wrap; for example "Injuries & / Suspensions".
   - Meta in muted 11px `<small>`, hidden at phone two-up width.
   - Chevron `›` pointing right.
2. **Preview area** (`PreviewArea`): tapping plain content toggles the section open. Buttons inside it
   open their own item (`section-card.tsx:35-38`).
3. **"View …" link button**: blue `#2563EB`, 12px bold, ends with `→` (`ArrowRightIcon`). It carries
   `aria-controls`, `aria-expanded=false` and toggles the section open (`section-card.tsx:39`).

**Opened state:**

1. The border switches to the accent solid colour (`details-ui.tsx:62`).
2. The chevron rotates 90° and turns blue (`details-ui.tsx:103`).
3. The preview and the View link are removed (`section-card.tsx:34`).
4. A `Panel` with a 1px top border follows (`section-card.tsx:42-48`):
   - **Breadcrumb** `nav` (aria-label "Location in match details"), 11px. Items:
     - "Match details" button: closes the section.
     - Section title: plain current text, or a button when an item is open (closes the item).
     - Item label: current text, shown only when an item is open.
     - Items are separated by `/`.
   - **Visually hidden `h3`** with the section title. It is the focus target when the section opens
     (`section-card.tsx:45`).
   - **Section content** (described per screen below).
   - **"Collapse {section}"** link button, for example "Collapse Lineups" (`section-card.tsx:47`).

### 0.3 Shared controls and primitives (`details-ui.tsx`)

| Primitive | Lines | Phone spec |
| --- | --- | --- |
| `ChoiceGroup` / `Choices` (filter chips) | 225-260 | `role="group"` with an **aria-label only (no visible label)**. Real `<button aria-pressed>`. 26px min height (1.625rem). 11px medium text. Grey `surfaceMuted` fill. Pressed: blue `#2563EB` fill, white bold text. Scrolls horizontally with a **hidden scrollbar**. |
| `PanelBar` | 215-222 | Flex-wrap row with `space-between`. Two chip groups wrap onto two lines on phones. |
| `RowList` / `RowButton` | 363-389 | Full-width `<button>` rows. Min height 34px (2.125rem). 12px text. 1px divider between rows. No chevron. |
| `Pill` | 391-407 | 11px bold, accent text on accent soft fill, square-ish (4px radius). |
| `Facts` (`dl`) | 417-428 | `dt` muted 11px, `dd` 12px. Two columns (`fit-content(40%) / 1fr`) once the container is ≥ 18rem, which applies to opened cards at 375px. |
| `Note` | 262-268 | Muted 12px paragraph, line-height 1.45. |
| `SectionState` | 272-277 | Loading: `role="status"` "Loading every record for this section…". Error: `role="alert"` "This section could not be loaded. The preview above is still shown." followed by a "Try again" link button. |
| `Pager` | 348-360 | `nav` aria-label "Pages". Hidden when there is one page. Shows `‹` (aria "Previous page"), numbered buttons (aria "Page N", `aria-current="page"` on the current one, teal brand fill), `…` gaps (aria-hidden), and `›` (aria "Next page"). On phones the buttons stretch across the full width and are 32px tall (`pagination-styles.ts:19,30`). Page window: all pages when there are 6 or fewer, otherwise 1 … p-1 p p+1 … N (`feed-presentation.ts:42-56`). |
| `LinkButton` | 148-164 | Blue 12px bold text button with a 24px min height. |
| `Crest` | 334-336 | Team logo, round, 20px by default. Falls back to initials (for example "RB" or "UW" in the screenshots). |

Card accents and icons (`details-icons.tsx`):

| Card | Accent | Icon |
| --- | --- | --- |
| Lineups | emerald | pitch rectangle with centre circle (`LineupIcon`) |
| Players | blue | person (`PlayerIcon`) |
| Injuries & Suspensions | red | bold plus sign (`InjuryIcon`) |

### 0.4 Shared status colours (`squad-sections.tsx:22`, `:252-253`)

| Pill | Accent | Light text / fill | Dark text / fill |
| --- | --- | --- | --- |
| "Out" | red | `#991B1B` / `#FEE2E2` | `#FF9C9C` / `#3B252C` |
| "Doubtful" | amber | `#92400E` / `#FEF0C7` | `#F6C453` / `#322A1E` |
| "Status unclear" | blue | `#1E40AF` / `#E0EAFF` | `#9EC5FF` / `#233449` |
| "Starter" (Players rows only) | emerald | `#065F46` / `#D1FAE5` | `#70DEA4` / `#1C342B` |
| "Substitute" (Players rows only) | blue | same as "Status unclear" | same as "Status unclear" |

### 0.5 URL state (addressable, survives refresh, Back/Forward)

Defined in `match-view.ts:8,39-40,53-107` and documented in `docs/match-details.md` § URL state.

| Key | Values in this group | Written by | History mode |
| --- | --- | --- | --- |
| `section` | `lineups` · `players` · `injuries` | Header button, "View …", preview tap, breadcrumb "Match details", "Collapse …" | **push** |
| `item` | `home-{playerId}` / `away-{playerId}`, for example `home-1460` | Row or pitch tap (push). "Back to list" and the breadcrumb section crumb set it to null (also **push**). | push |
| `team` | `home` · `away` (`both` is the default and omitted) | Team chips | replace |
| `tab` | Players: `G` `D` `M` `F`. Injuries: `out` `doubtful` `unknown`. | Position / Status chips | replace |
| `page` | 1–1000 (1 omitted) | Pager. Any filter change resets it to 1. | replace |

Rules:

- Opening another section resets `tab`, `item`, `page`, `team`, `venue`, `window` and `comp`
  (`openSection`, `match-view.ts:99-102`).
- A preview-row tap uses `openItem`, which opens the section with fresh filters and the item in one
  push (`match-view.ts:105-107`).
- Invalid values fall back to defaults.
- Other query keys (revision history) are preserved.

Deep link examples:

- `/en/matches/1208021/arsenal-vs-chelsea?section=players&team=away&tab=D&page=2`
- `/en/matches/1208021/arsenal-vs-chelsea?section=injuries&item=away-19545`

The page is server-rendered with the opened section. However, every control is a JS `<button>` that
uses `history.pushState` / `replaceState`, so these sections have **no no-JS link fallback**.

### 0.6 Data loading (`use-match-view.ts:43-61`, `docs/match-details.md` § Data)

- **Preview data** comes from one stored read at page render (`insightsPreview`). Players and injuries
  are truncated to **6** each (`previewRules`, `match-insight-presentation.ts:62`). Lineups are always
  complete. The cards render only the **first 3** rows (`squad-sections.tsx:260,307`).
- **Full section data** is fetched on first open from `/api/matches/{id}/insights?section=…` and cached
  for 10 minutes. No fetch happens when a preview under 5 minutes old already holds the full collection.
- **Every squad section fetches all three collections** (players, injuries, lineups) when opened,
  because the player panel looks across all of them (`usePlayerLookup`, `squad-sections.tsx:61-76`).
  Loading and error states are therefore the OR of three requests.
- **The preview is never refreshed** by the live poll (`live-match-detail.tsx:60` passes the initial
  `preview`). A lineup published while the page is open appears only after a reload.
- **Data origin:** squad data comes only from permitted evidence in the prediction's snapshot. The
  players list is lineup players (starters and substitutes, in evidence order) plus injured players
  not in a lineup, appended with `number`, `position`, `grid` and `role` all **null**
  (`insights-read.ts:81-110`). Injury `status` is derived from the provider type: "Missing Fixture" →
  `out`, "Questionable"/"Doubtful" → `doubtful`, anything else → `unknown`
  (`match-insight-presentation.ts:50-53`). Injury `source` is the evidence publisher, in practice
  "API-Football".
- **Not collected (must not be invented):** season statistics, ratings, portraits, player markets,
  managers, expected return dates (`docs/match-details.md:66-69`).
- **Timestamps** use `messages.reportingInstant`, for example "Oct 13, 2026, 21:02 EAT" (24h, EAT),
  wrapped in `<time dateTime>`.

### 0.7 Shared nested screen: Player details item panel (`PlayerPanel`, `squad-sections.tsx:36-58`)

All three sections open this panel. It replaces the list inside the opened card
(`ItemPanel`, `section-card.tsx:54-62`). Top to bottom:

1. The card header stays.
2. Breadcrumb: "Match details / {Section title} / {Player name}". The first two crumbs are buttons.
3. "‹ Back to list" link button. It sets `item` to null with a push. Focus returns to the row that
   opened the panel (`useReturnFocus`, `section-card.tsx:65-74`).
4. `h4` heading with the player name, falling back to "Player name unavailable". It receives focus, and
   the card scrolls to its top (`useRevealOnOpen(..., "card")`).
5. `Facts` list. The label (`dt`) is on the left and the value (`dd`) on the right, because the opened
   card is ≥ 18rem:

   | `dt` label | `dd` value rules |
   | --- | --- |
   | "Team" | Home or away team name. |
   | "Shirt number" | Number, or "—". |
   | "Position" | Raw provider position (`G`/`D`/`M`/`F`), or "Not available". |
   | "Lineup role" | "Starter" or "Substitute". Without a role: "Not in the confirmed lineup" when that team's lineup exists, otherwise "Lineup not published". |
   | "Availability" | Status pill ("Out" / "Doubtful" / "Status unclear"), a space, then `type · reason`, for example "Missing Fixture · Knee Injury". Without an injury: "No absence reported in the stored evidence". |
   | "Reported" | **Only when injured:** `{source} · {time}`, for example "API-Football · Oct 12, 2026, 09:30 EAT". |
   | "Expected return" | Always "Not provided by the source". |

6. Note: "Season statistics, ratings, portraits and player markets are not collected yet, so none are
   shown."
7. "Collapse {section}" link at the bottom of the card.

States:

- **Loading or error** shows above the panel, because `SectionState` renders first.
- **Unknown or invalid player id** (deep link) shows the title "Player name unavailable", "—", "Not
  available" and the remaining fallbacks. There is no explicit "not found" message.
- **Player with an injury but not in a lineup**: "Shirt number" is "—", "Position" is "Not available",
  and "Lineup role" is "Not in the confirmed lineup" or "Lineup not published".
- **Duplicate injury records** for the same player: the panel shows only the first one
  (`squad-sections.tsx:72`).

### 0.8 Type scale and tokens used (`src/styles/theme.ts`)

**Scale** (`theme.ts:238-245`):

| Step | Size | Used for |
| --- | --- | --- |
| micro | 10px | Pitch names |
| caption | 11px | Chips, breadcrumbs, pills, meta, `dt` |
| secondary | 12px | Notes, rows, links, `dd` |
| body | 13px | Card titles |
| emphasis | 14px | Item `h4` |

Font: Manrope (Arial fallback).

**Light theme:**

| Token | Value |
| --- | --- |
| text | `#102A3A` |
| muted | `#486071` (≈6.6:1 on white) |
| page | `#CEDBE3` |
| surface | `#FFFFFF` |
| surfaceMuted | `#EAF0F2` |
| border | `#C5D4DE` |
| brand | `#007F7A` (white on brand 4.86:1) |
| focus ring | 3px `#007F7A`, offset 2px |
| link button | `#2563EB` (5.17:1 on white) |

**Dark theme:**

| Token | Value |
| --- | --- |
| text | `#F2F7F8` |
| muted | `#B1BEC8` |
| page | `#141C22` |
| surface | `#1E2932` |
| surfaceMuted | `#18232B` |
| border | `#3C505E` |
| brand / focus | `#53D5C6` |
| link | `#9EC5FF` |

**Header** (both themes): navy `#102A3A` (dark `#10181D`), teal accent `#39D5CA` (dark `#53D5C6`).
Corners are square everywhere (`cardRadius: 0`). Cards have no shadows.

**Pitch colours are hard-coded:** stripes `#15803D` / `#16A34A`, white text, white number badge
(`squad-sections.tsx:86,104,114,125`).

**Sizing guideline** (`docs/brand-styling.md:50-51,78-79`): phones use a 2.25rem (36px) compact
control height, and text links keep a 2rem target.

---

## 1. Screen `lineups`: Lineups section view

### 1.1 Identity and entry

- **Title:** "Lineups" (`details.section.lineups`).
- **Where:** Lineups card on the Match details overview, second column of grid row 2, beside "Team
  Form".
- **Ways to open** (each pushes `?section=lineups`):
  - The header button "Lineups".
  - The link "View lineups →".
  - Tapping anywhere on the preview.
- **Deep links:** `…?section=lineups`, `…&team=home|away`, `…&item=home-1460`.
- **Way back:** see the actions table in §1.4. On the phone bar, `‹` ("Back to matches") leaves
  Match details entirely and returns to the feed.

### 1.2 Purpose / user task

See whether confirmed starting lineups exist and each team's formation. Then read each team's
Starting XI and Substitutes, both on a formation pitch and as a list, and open a player to check
shirt number, position, lineup role and availability.

### 1.3 Content blocks (ordered)

**A. Overview card, closed** (`squad-sections.tsx:171-182`)

1. **Header:** emerald `LineupIcon` badge, then "Lineups". Meta "Confirmed" appears when at least one
   lineup exists; it is hidden at phone two-up width.
2. **Preview, populated:** one row with the home crest and **bold formation** (for example "4-3-3")
   on the left, and the away crest and formation (for example "4-2-3-1") on the right, at 12px. A
   missing formation, or an unpublished side, shows "Formation unknown". Below it, a decorative
   **mini-pitch** with dots: home dots red, away dots navy (white in dark mode), `aria-hidden`.
   **The mini-pitch is not displayed at phone two-up width** (`squad-sections.tsx:79-80`, needs a
   container ≥ 15rem).
3. **Preview, empty:** Note "No confirmed lineup has been published for this match yet."
4. **Link:** "View lineups →".

**B. Opened section view** (`squad-sections.tsx:183-213`)

1. Card header: "Lineups", meta "Confirmed" (visible now), chevron rotated.
2. Breadcrumb: "Match details / Lineups".
3. `SectionState`: "Loading every record for this section…" or "This section could not be loaded. The
   preview above is still shown. Try again".
4. **Team chips** (group aria-label "Team"): "Both teams" | {home name} | {away name}.
5. **For each selected side** (home then away, or the one chosen), stacked in one column on phones.
   `LineupGrid` only goes two-column at a 40rem container (`squad-sections.tsx:138`). Each side is a
   `<section aria-label="{team}">`:
   1. **Team line (bold):** crest (20px), then "{Team} · {formation}", for example "Arsenal · 4-3-3".
      The formation is omitted when null.
   2. If the lineup exists:
      - Note "Confirmed lineup · updated Oct 13, 2026, 21:02 EAT". The pattern is
        `details.lineupStatus` "{status} lineup · updated" plus a `<time>`.
      - **Pitch** (`<ol aria-label="Formation">`). Shown only when **every** starter has a provider
        `grid` cell (`pitchRows`, `match-details.ts:111-120`). It has green horizontal stripes and
        rows reversed so **forwards are at the top and the goalkeeper at the bottom**. Each player is
        a `<button aria-label="Open player details: {player}">`: a white circular **shirt-number
        badge** (24px) above the **surname** (last word of the name, 10px white). A missing number
        shows "–"; a missing name shows "?".
      - **"Starting XI"** (bold `<strong>`, not a heading), then a `RowList` of 11 rows. Each row is
        `{number}` (muted, tabular, right-aligned) · `{full name}` (ellipsis) · `{position}` (raw code,
        for example "G") · an empty fourth column.
      - **"Substitutes"** (bold), then rows in the same format, or Note "No substitutes listed.".
      - Note "Managers are not included in the stored lineup data."
   3. If the lineup is missing for that side: Note "Lineup not published".
6. Link "Collapse Lineups".

**C. Player details item panel:** see §0.7. Breadcrumb "Match details / Lineups / {player}".

### 1.4 Controls and actions

| Control | Accessible name | Result |
| --- | --- | --- |
| Header button | "Lineups" (+ "Confirmed" when meta is visible) | Toggle `section=lineups` (push). Collapsing returns focus to this button. |
| Preview area tap | n/a | Opens the section (push). |
| "View lineups →" | "View lineups" | Opens the section (push). |
| Breadcrumb "Match details" | "Match details" | Closes the section, back to the overview (push). |
| Team chip "Both teams" / home / away | chip text, `aria-pressed` | Sets `team` (replace) and shows one or both sides. |
| Pitch player button | "Open player details: {name}" | `item={side}-{id}` (push). Opens the Player details panel. |
| Starting XI / Substitutes row | row text, for example "7 B. Saka F" | Same as the pitch button. |
| "‹ Back to list" (in panel) | "‹ Back to list" | `item` cleared (push). Focus returns to the first element with that `data-item-key`. |
| Breadcrumb "Lineups" (in panel) | "Lineups" | Same as Back to list. |
| "Collapse Lineups" | "Collapse Lineups" | Closes the section (push). Focus returns to the header button. |
| Browser Back | n/a | Steps back through section and item history entries. |
| Phone bar `‹` | "Back to matches" | Leaves for the stored feed URL (`match-details.tsx:188`). |

### 1.5 States

| State | What renders |
| --- | --- |
| **Empty** (no lineup in evidence) | Card note "No confirmed lineup has been published for this match yet." Opened: Team chips, then for each side the team name and "Lineup not published". This is the reference-screenshot state; the typical case far from kickoff and while research is disabled. |
| **One side published** | Card preview shows the formation for the published side and "Formation unknown" for the other. Opened: published side in full; the other side shows "Lineup not published". |
| **Both published** | As in §1.3 B. Meta "Confirmed". |
| **Formation null** | Card shows "Formation unknown". Opened team line has no " · formation". |
| **Some starters lack `grid`** | No pitch at all; only the lists. |
| **No substitutes** | "No substitutes listed." |
| **Missing name or number** | Lists show "Player name unavailable" and "–". Pitch shows "?" and "–". |
| **Loading** | "Loading every record for this section…" above the content. Lineups come from the preview; this status still appears while players or injuries are fetched. |
| **Error** | Alert plus "Try again". The lists still render from preview data. |
| **Preview read failed** (`preview = null`) | The card shows the **empty** note, indistinguishable from a real empty (`match-detail-route.tsx:29-30`). Opening fetches the data. |
| **Item open** | Player details panel (§0.7). |
| **Upcoming / live / finished** | Identical UI; no status-specific content. The preview is not refreshed by live polling. |
| **Status values** | Only "Confirmed" exists (`lineupSchema.status`); there is no provisional lineup state. |

### 1.6 Current phone layout (375px)

**Closed:**

- Half-width card (167px) beside Team Form.
- 30px header. The title "Lineups" fits on one line; the meta is hidden.
- Populated: a 12px line with two crests and two bold formations. No pitch.
- Empty: a 4-line note wrapping at about 149px.
- A blue "View lineups →" link.
- Card heights in the row do not match, so a blank area appears below the shorter card (reference
  `05-detail-sections.jpg`).

**Opened:**

- The card goes full width with an emerald border.
- **The Players card jumps above it**, beside Team Form, because of dense auto-placement
  (`match-details.tsx:127,132`).
- Contents in order:
  1. Header.
  2. Breadcrumb.
  3. Chip row: Both teams · Arsenal · Chelsea.
  4. Home team line and update note.
  5. Pitch, about 4–5 rows × 44px.
  6. "Starting XI" with 11 × 34px rows.
  7. "Substitutes" with about 7–12 rows.
  8. Manager note.
  9. **The whole away block repeated** in the same way.
  10. "Collapse Lineups".
- Total height with "Both teams" is roughly **2,000px, about 3 phone screens**.
- Nothing is sticky inside the section.
- The fixed tab bar covers the bottom 42px. Focus targets carry a 4.5rem bottom scroll margin
  (`details-ui.tsx:47-50`).

### 1.7 Friction points

| Criterion | Issue | Evidence |
| --- | --- | --- |
| Accessibility | Pitch surnames are 10px white text on stripes. On the lighter stripe `#16A34A` the contrast is about **3.3:1**, below 4.5:1. | `squad-sections.tsx:104,114,119` |
| Accessibility | In dark mode the pitch shirt-number badge is `theme.color.text` (`#F2F7F8`) on `#fff`, about **1.07:1**, so the numbers are invisible. | `squad-sections.tsx:125`; `theme.ts:306` |
| Accessibility | "Starting XI", "Substitutes" and the team names are `<strong>`, not headings, so screen-reader users cannot jump between the two teams or the lists. | `squad-sections.tsx:190,198,203` |
| Accessibility | Position is shown as a raw code ("G", "D", "M", "F") and is read as a single letter. | `squad-sections.tsx:201,206` |
| Accessibility | List rows are 34px, chips 26px, links 24px and breadcrumb buttons are unsized 11px text. All are below the 36px phone control height and the 2rem link target in the brand guide. | `details-ui.tsx:152,173,236,375`; `docs/brand-styling.md:50-51,78-79` |
| Easy navigation | After "Back to list", focus and scroll go to the **pitch button**, not the list row that was tapped. Pitch and rows share `data-item-key`, and `querySelector` picks the first. | `squad-sections.tsx:159,199,205`; `section-card.tsx:69` |
| Easy navigation | When Lineups opens, the Players card visually moves above it, while DOM and focus order put Players after Lineups. | `match-details.tsx:127,132` |
| Easy navigation | The only close and back controls are at the top (breadcrumb, header) and at the very bottom ("Collapse Lineups"). None is sticky, and the section is about 3 screens long. The phone bar `‹` leaves Match details instead of closing the section. | `section-card.tsx:43-47`; `match-details.tsx:188` |
| Easy navigation | "Back to list" and the breadcrumb crumbs push new history entries, so the browser Back button returns to the closed item. | `section-card.tsx:43,58`; `use-match-view.ts:30` |
| Simplicity | Each team's starters appear twice: on the pitch and again in the "Starting XI" list. | `squad-sections.tsx:195-202` |
| Simplicity | The breadcrumb repeats the card title directly under the header ("Lineups" / "Match details / Lineups"). | `section-card.tsx:32,43-44` |
| Simplicity | The preview mini-pitch never appears on phones, so the closed card shows only two formations. | `squad-sections.tsx:80` |
| Short flows | "Both teams" stacks home then away. Reaching the away XI takes a long scroll or a chip tap first. | `squad-sections.tsx:155,186-211` |
| Short flows | Opening Lineups also fetches players and injuries, and their loading message shows even though lineups are already complete. | `squad-sections.tsx:64-65,74` |
| Short flows | The squad cards sit below the All Markets & Odds card, which is expanded by default (about 1,000px). | `match-view.ts:19,35`; `match-details.tsx:242-249` |
| Uniformity | Lineup rows use a third row pattern (number · name · code · empty cell). Players and Injuries each use their own. | `squad-sections.tsx:130-134,201` |
| Uniformity | Two-up cards in a row have unequal heights. | `match-details.tsx:129`; `05-detail-sections.jpg` |
| Accuracy | With one side published, the unpublished side shows "Formation unknown" instead of "Lineup not published". | `squad-sections.tsx:178` |
| Accuracy | The error text says "The preview above is still shown", but the preview is removed when the section is open. | `section-card.tsx:34`; `en.ts:425` |

### 1.8 Must keep

- **URL state:** `section=lineups`, `team`, `item=home-{id}|away-{id}`. Opening and closing a
  section or item pushes a history entry; team changes replace it.
- **Formation:** the formation per team, with "Formation unknown" when the value is missing.
- **Update note:** "Confirmed lineup · updated {EAT time}" with `<time dateTime>`.
- **Team views:** both teams plus single-team filtering ("Both teams" / home / away).
- **Lists:** the Starting XI and Substitutes lists, with "No substitutes listed.".
- **Pitch:** pitch order uses the provider grid only. Never infer positions; pitch rows exist only when
  every starter has a grid.
- **Disclaimers:** "Managers are not included in the stored lineup data." and "Lineup not
  published".
- **Pitch button names:** "Open player details: {player}".
- **Card accent and icon:** emerald, Lineups icon.
- **Focus behaviour:** the heading is focused on open, focus returns on collapse, and focus returns to
  the originating row after "Back to list".
- **Contrast:** at least 4.5:1 for all text, which includes fixing the pitch text and the badge.
- **No invented data:** no managers, ratings or portraits.
- **Player details panel:** reused from §0.7.

### 1.9 Sample data (populated, from existing fields only)

Fixture: Arsenal v Chelsea. Kickoff Oct 13, 2026 22:00 EAT, upcoming with lineups out.

- **Card:** Arsenal crest "4-3-3" | Chelsea crest "4-2-3-1". Meta "Confirmed".
- **Opened, Arsenal:**
  - Team line "Arsenal · 4-3-3". Note "Confirmed lineup · updated Oct 13, 2026, 21:02 EAT".
  - Pitch, top to bottom:
    - Forwards: 11 Martinelli, 29 Havertz, 7 Saka.
    - Midfield: 41 Rice, 5 Partey, 8 Ødegaard.
    - Defence: 12 Timber, 6 Gabriel, 2 Saliba, 4 White.
    - Goalkeeper: 22 Raya.
  - Starting XI:

    | No. | Name | Pos. |
    | --- | --- | --- |
    | 22 | D. Raya | G |
    | 4 | B. White | D |
    | 2 | W. Saliba | D |
    | 6 | Gabriel | D |
    | 12 | J. Timber | D |
    | 8 | M. Ødegaard | M |
    | 5 | T. Partey | M |
    | 41 | D. Rice | M |
    | 7 | B. Saka | F |
    | 29 | K. Havertz | F |
    | 11 | G. Martinelli | F |

  - Substitutes:

    | No. | Name | Pos. |
    | --- | --- | --- |
    | 32 | Neto | G |
    | 15 | J. Kiwior | D |
    | 33 | R. Calafiori | D |
    | 49 | M. Lewis-Skelly | D |
    | 23 | M. Merino | M |
    | 53 | E. Nwaneri | F |
    | 19 | L. Trossard | F |

- **Opened, Chelsea:**
  - Team line "Chelsea · 4-2-3-1".
  - Starters: 1 R. Sánchez G, 27 M. Gusto D, 23 T. Chalobah D, 6 L. Colwill D, 3 M. Cucurella D,
    25 M. Caicedo M, 8 E. Fernández M, 7 Pedro Neto F, 10 C. Palmer M, 19 J. Sancho F, 15 N. Jackson F.
  - Substitutes: 12 F. Jörgensen G, 5 B. Badiashile D, 24 R. James D, 45 R. Lavia M,
    22 K. Dewsbury-Hall M, 18 C. Nkunku F, 11 N. Madueke F.
- **Item example (B. Saka, `item=home-1460`):**

  | Label | Value |
  | --- | --- |
  | Team | Arsenal |
  | Shirt number | 7 |
  | Position | F |
  | Lineup role | Starter |
  | Availability | No absence reported in the stored evidence |
  | Expected return | Not provided by the source |

  Followed by the stats-missing note.

---

## 2. Screen `players`: Players section view

### 2.1 Identity and entry

- **Title:** "Players" (`details.section.players`).
- **Where:** Players card, first column of grid row 3, beside "News & Insights".
- **Ways to open:**
  - The header button "Players", the link "View all players →", or a tap on a non-row part of the
    preview. Each pushes `?section=players`.
  - **A preview row tap** pushes `?section=players&item={side}-{id}` and opens the player directly
    (`openItem`).
- **Deep links:** `…?section=players&team=home&tab=M&page=2`.
- **Way back:** see the actions table in §2.4.

### 2.2 Purpose / user task

Browse every player stored for this match, filtered by team and position group. See each player's
team, position, shirt number, and either the lineup role or the availability status. Open a player
for details.

### 2.3 Content blocks (ordered)

**A. Overview card, closed** (`squad-sections.tsx:256-260`)

1. **Header:** blue `PlayerIcon` badge, then "Players". Meta "{count} players" / "1 player" is hidden on
   phones. When closed, the count is the preview length (≤ 6), not the full total
   (`squad-sections.tsx:246`).
2. **Preview, populated:** a `RowList` of the **first 3 players** (`SquadRow`, `squad-sections.tsx:247-255`).
   Each row is a `<button>` with:
   - An initials avatar: 24px grey circle, 9px bold muted text, `aria-hidden`. For example "DR".
   - A name block: **bold name** (ellipsis), then a muted 11px line
     "{Team} · {position} · #{number}". Null parts are dropped, for example "Arsenal · G · #22".
   - A right-hand pill. An injury takes precedence ("Out" / "Doubtful" / "Status unclear"); otherwise
     the role ("Starter" emerald / "Substitute" blue); otherwise nothing.
3. **Preview, empty:** Note "No player records are stored for this match yet."
4. **Link:** "View all players →".

**B. Opened section view** (`squad-sections.tsx:261-272`)

1. Header "Players", meta "40 players". Breadcrumb "Match details / Players".
2. `SectionState` (loading or error, as in §0.3).
3. `PanelBar` with two chip groups, which wrap onto two lines:
   - **Team** (aria "Team"): "Both teams" | {home} | {away}.
   - **Position** (aria "Position"): "All positions" | "Goalkeepers" | "Defenders" | "Midfielders" |
     "Forwards". At about 325px this row overflows and "Forwards" scrolls out of view with no visible
     scrollbar.
4. **List:** up to **15 rows per page** (`pageOf(filtered, page, 15)`), in the same `SquadRow` format
   as the preview. Order is evidence order (lineup players first, then injury-only players). There is
   no sort.
5. **Empty notes:** "No players match these filters." when the filters exclude everyone, or "No player
   records are stored for this match yet." when there is no data.
6. **Pager** (only when there are more than 15 rows): `‹ 1 2 3 ›`.
7. Note "Season statistics, ratings, portraits and player markets are not collected yet, so none are
   shown."
8. Link "Collapse Players".

**C. Player details item panel:** see §0.7. Breadcrumb "Match details / Players / {player}".

### 2.4 Controls and actions

| Control | Accessible name | Result |
| --- | --- | --- |
| Header button | "Players" (+ "40 players" when meta is visible) | Toggle the section (push). |
| Preview row (×3) | for example "D. Raya Arsenal · G · #22 Starter" | `openItem`: section plus item in one push. Focus goes to the item heading. |
| Preview whitespace tap / "View all players →" | "View all players" | Opens the section (push). |
| Team chips | chip text, `aria-pressed` | `team` (replace), `page` reset to 1. |
| Position chips | chip text | `tab=G/D/M/F`, or removed for "All positions" (replace), `page` reset to 1. |
| Pager `‹` / numbers / `›` | "Previous page" / "Page N" / "Next page" | `page` (replace). **No scroll or focus move.** |
| List row | row text | `item` (push), opens the panel. |
| "‹ Back to list" / breadcrumb "Players" | n/a | `item` cleared (push). Focus returns to the row, and filters and page are kept. |
| Breadcrumb "Match details" / "Collapse Players" | n/a | Closes the section (push). Filters reset on the next open. |

### 2.5 States

| State | What renders |
| --- | --- |
| **Empty** | Card note "No player records are stored for this match yet." Opened: chips plus the same note, no pager. Reference screenshot. |
| **Populated ≤ 6** | The preview is complete and no fetch happens if it is under 5 minutes old. |
| **Populated > 6** | Opening fetches the full list. Until it arrives, the list shows the 6 preview rows plus "Loading every record for this section…". The meta reads "6 players", then updates. |
| **Filtered empty** | "No players match these filters." |
| **Injury-only players** | Position is null, so they are **excluded by every position chip** and appear only under "All positions". Their meta reads just "Chelsea", with no position or number. |
| **Error** | "This section could not be loaded. The preview above is still shown." plus "Try again". Preview rows remain in the list. |
| **Multi-page** | Pager with up to 5 numbers and `…` gaps. 40 players gives 3 pages (15/15/10). |
| **Item open** | §0.7 panel. |
| **Preview read failed** | The card shows the empty note (misleading). |
| **Match status** | No differences between upcoming, live and finished. |

### 2.6 Current phone layout (375px)

**Closed:**

- Half-width card beside News & Insights.
- Header "Players" with a chevron.
- Three 34px rows at about 149px wide. With avatar (24px) plus pill (about 50–60px), the name column
  is about 55px, so names truncate ("W. Sali…"). The meta line wraps to two lines.
- Link "View all players →".
- Empty: a 3-line note and the link.

**Opened:**

- Full width with a blue border.
- Contents in order:
  1. Header with meta.
  2. Breadcrumb.
  3. Two chip rows.
  4. 15 rows × 34px, about 510px.
  5. A 32px full-width pager.
  6. The 12px note.
  7. "Collapse Players".
- About 1.3 screens per page.
- After paging, the viewport stays at the pager with the new rows above it.

### 2.7 Friction points

| Criterion | Issue | Evidence |
| --- | --- | --- |
| Accessibility | Chip groups have no visible label ("Team" / "Position" are aria-only), so the two unlabeled chip rows rely on the chip text alone. | `details-ui.tsx:256`; `squad-sections.tsx:31,265` |
| Accessibility | The position chip row overflows at 325px with a hidden scrollbar, so "Forwards" is undiscoverable. | `details-ui.tsx:231-233`; `squad-sections.tsx:265-267` |
| Accessibility | Avatar initials are 9px. Meta text and pills are 11px. | `squad-sections.tsx:225`; `details-ui.tsx:401`; `squad-sections.tsx:232` |
| Accessibility | Rows have no visual affordance (no chevron) that they open details. | `squad-sections.tsx:228-233` |
| Accessibility | "Status unclear" (injury) and "Substitute" (role) share the same blue pill, so colour cannot tell them apart. | `squad-sections.tsx:22,253` |
| Accessibility | Tap targets are below the 36px compact height: rows 34px, chips 26px, pager 32px. | `details-ui.tsx:236,375`; `pagination-styles.ts:30` |
| Simplicity | Position shown as a raw code ("D") in rows and the panel, while filters use words ("Defenders"). | `squad-sections.tsx:44,251,267` |
| Simplicity | Players overlaps both Lineups (every lineup player, with a role pill) and Injuries (every injured player, with a status pill). Three sections cover the same people. | `insights-read.ts:81-110` |
| Short flows | Changing page does not scroll to the list top or move focus, so the user must scroll up after every page change. | `squad-sections.tsx:270`; `details-ui.tsx:348-360` |
| Short flows | Injury-only players disappear under every position filter. | `insights-read.ts:109-110`; `squad-sections.tsx:243` |
| Short flows (good, keep) | A preview row opens the player directly in one tap. | `squad-sections.tsx:249`; `match-view.ts:105-107` |
| Easy navigation | "Back to list" pushes history, and the collapse and back controls are not sticky. Same as Lineups. | `section-card.tsx:47,58` |
| Uniformity | `SquadRow` (avatar + name/meta + pill) differs from the Lineups `PlayerRow` and the Injuries `InjuryRow` for the same entity. | `squad-sections.tsx:130,228,276` |
| Uniformity | The CTA wording differs across the three cards: "View lineups" / "View all players" / "View full injuries list". | `en.ts:503-506` |
| Accuracy | The closed-card count uses the preview length (≤ 6) instead of `totals.players`. It is visible on wider screens and while the section loads. | `squad-sections.tsx:246` |
| Simplicity | An empty section still opens with filters and the "View all players" CTA. | `squad-sections.tsx:257,262-271` |

### 2.8 Must keep

- **URL state:** `section=players`, `team`, `tab` (G/D/M/F), `page`, `item`. Filters replace the
  history entry, items push one, and any filter change resets the page to 1.
- **Page size:** 15 per page, and every page reachable through the pager. The pager is hidden when
  there is a single page. Accessible names: "Pages", "Previous page", "Page N", "Next page", and
  `aria-current`.
- **Row content:** name, `Team · position · #number`, and the injury pill taking precedence over the
  role pill.
- **Labels:** "All positions", "Goalkeepers", "Defenders", "Midfielders", "Forwards", "Both teams".
- **Empty messages:** "No players match these filters." and "No player records are stored for this
  match yet."
- **Disclaimer:** "Season statistics, ratings, portraits and player markets are not collected yet, so
  none are shown." Do not add stats, ratings, photos or markets.
- **Card accent:** blue, with the person icon.
- **One-tap item open** from the preview.
- **Player details panel:** reused from §0.7.

### 2.9 Sample data (populated)

- **Card:** meta "40 players". Preview rows:

  | Avatar | Name | Meta | Pill |
  | --- | --- | --- | --- |
  | DR | D. Raya | Arsenal · G · #22 | Starter |
  | BW | B. White | Arsenal · D · #4 | Starter |
  | WS | W. Saliba | Arsenal · D · #2 | Starter |

- **Opened, Chelsea + Defenders** (`?section=players&team=away&tab=D`), seven rows, no pager:

  | Name | Meta | Pill |
  | --- | --- | --- |
  | M. Gusto | Chelsea · D · #27 | Starter |
  | T. Chalobah | Chelsea · D · #23 | Starter |
  | L. Colwill | Chelsea · D · #6 | Starter |
  | M. Cucurella | Chelsea · D · #3 | Starter |
  | B. Badiashile | Chelsea · D · #5 | Substitute |
  | R. James | Chelsea · D · #24 | Doubtful |

  W. Fofana (injury-only) is *not* shown here because his position is null. He appears under "All
  positions" as "W. Fofana — Chelsea — Out".
- **Both teams, All positions:** 3 pages, `‹ 1 2 3 ›`.
- **Item example (R. James):**

  | Label | Value |
  | --- | --- |
  | Team | Chelsea |
  | Shirt number | 24 |
  | Position | D |
  | Lineup role | Substitute |
  | Availability | [Doubtful] Questionable · Muscle Injury |
  | Reported | API-Football · Oct 12, 2026, 09:30 EAT |
  | Expected return | Not provided by the source |

---

## 3. Screen `injuries`: Injuries & Suspensions section view

### 3.1 Identity and entry

- **Title:** "Injuries & Suspensions" (`details.section.injuries`). It wraps to "Injuries & /
  Suspensions" in the two-up header.
- **Where:** first column of grid row 4, beside "Match Context".
- **Ways to open:**
  - The header button, the link "View full injuries list →", or a tap on preview whitespace. Each
    pushes `?section=injuries`.
  - **A preview row tap** pushes `?section=injuries&item={side}-{id}`.
- **Deep links:** `…?section=injuries&team=away&tab=out`.
- **Way back:** "‹ Back to list", the breadcrumb, "Collapse Injuries & Suspensions", or browser Back.

### 3.2 Purpose / user task

See which players are reported absent or doubtful for each team, the reported type and reason, and
the source and report time. Filter by team and status.

### 3.3 Content blocks (ordered)

**A. Overview card, closed** (`squad-sections.tsx:303-307`)

1. **Header:** red `InjuryIcon` (plus sign) badge, then "Injuries & Suspensions". Meta "{count}
   absences" / "1 absence" is hidden on phones; when closed it shows the preview length (≤ 6)
   (`squad-sections.tsx:293`).
2. **Preview, populated:** the first 3 `InjuryRow` buttons (`squad-sections.tsx:294-302`). Each row has:
   - A red plus icon (16px column).
   - A **bold player name**, then a muted 11px single line "{Team} · {type} · {reason}" with ellipsis.
     For example "Arsenal · Missing Fixture · Knee Injury".
   - A status pill: "Out" (red) / "Doubtful" (amber) / "Status unclear" (blue).
3. **Preview, empty:** Note "No absences are reported in the stored evidence."
4. **Link:** "View full injuries list →".

**B. Opened section view** (`squad-sections.tsx:308-319`)

1. Header "Injuries & Suspensions", meta "5 absences". Breadcrumb "Match details / Injuries &
   Suspensions".
2. `SectionState`.
3. `PanelBar` with two chip groups:
   - **Team:** "Both teams" | {home} | {away}.
   - **Status** (aria "Status"): "All statuses" | "Out" | "Doubtful" | "Status unclear". This row fits
     at 325px.
4. **List:** 15 per page, `InjuryRow` format, evidence order.
5. **Empty notes:** "No absences match these filters." or "No absences are reported in the stored
   evidence."
6. **Pager** when there are more than 15.
7. Note "From the provider injury list in this prediction's evidence. Return dates are shown only when
   the source gives one."
8. Link "Collapse Injuries & Suspensions".

**C. Player details item panel:** see §0.7. "Availability" shows the pill plus type and reason, and
"Reported" shows the source and time. Breadcrumb "Match details / Injuries & Suspensions / {player}".

### 3.4 Controls and actions

| Control | Accessible name | Result |
| --- | --- | --- |
| Header button | "Injuries & Suspensions" | Toggle the section (push). |
| Preview row (×3) | for example "G. Jesus Arsenal · Missing Fixture · Knee Injury Out" | `openItem` (push). Opens the player panel directly. |
| "View full injuries list →" / preview whitespace | "View full injuries list" | Opens the section (push). |
| Team chips | chip text | `team` (replace), `page` reset to 1. |
| Status chips | "All statuses" / "Out" / "Doubtful" / "Status unclear" | `tab=out/doubtful/unknown` (replace), `page` reset to 1. |
| Pager | "Previous page" / "Page N" / "Next page" | `page` (replace). |
| Row | row text | `item` (push). |
| "‹ Back to list" / breadcrumb section crumb | n/a | `item` cleared (push). Focus returns to the row. |
| "Collapse Injuries & Suspensions" / breadcrumb "Match details" | n/a | Closes the section (push). |

### 3.5 States

| State | What renders |
| --- | --- |
| **Empty** | Card note "No absences are reported in the stored evidence." Opened: chips plus the same note. Reference screenshot. |
| **Populated** | Rows with a status pill. Type or reason may be null and is then dropped from the meta line. A missing name shows "Player name unavailable". |
| **Filtered empty** | "No absences match these filters." |
| **Status variants** | "Out" (type "Missing Fixture"), "Doubtful" (type "Questionable"), "Status unclear" (any other or null type). |
| **Multi-page** | Pager (rare; up to 120 records). |
| **Loading / error** | As in Players. |
| **Preview read failed** | The card shows the empty note, which misleadingly reads as "no absences". |
| **Duplicate records** for one player | Two rows with the same `data-item-key`. The panel shows only the first injury (`squad-sections.tsx:72,296`). |
| **Match status** | No differences between upcoming, live and finished. |

### 3.6 Current phone layout (375px)

**Closed:**

- Half-width card beside Match Context.
- The header title takes two lines.
- Three 34px rows at about 149px. The meta line is truncated to about 10 characters ("Arsenal · Mi…").
  The pill is about 30–85px ("Status unclear" is the widest).
- Link "View full injuries list →" wraps to two lines.

**Opened:**

- Full width with a red border.
- Contents in order:
  1. Header.
  2. Breadcrumb ("Match details / Injuries & Suspensions").
  3. Team chips row, then Status chips row.
  4. Rows.
  5. Basis note.
  6. Collapse link.
- Usually short (fewer than 10 rows).

### 3.7 Friction points

| Criterion | Issue | Evidence |
| --- | --- | --- |
| Accessibility | The reason and type are truncated to a single ellipsized line in rows. The full text is reachable only by opening the player. | `squad-sections.tsx:281,299` |
| Accessibility | Chip groups have no visible label. Tap targets are 26px chips and 34px rows. | `details-ui.tsx:236,256,375` |
| Accessibility | "Status unclear" is blue, like "Substitute" in Players. | `squad-sections.tsx:22` |
| Simplicity | Status pills sit next to an always-red plus icon that adds no meaning: it is red even for "Status unclear". | `squad-sections.tsx:278,297` |
| Simplicity | The two-line title "Injuries & Suspensions" in a half-width header, plus the two-line CTA, make the card tall for little content. | `details-ui.tsx:92-98`; `05-detail-sections.jpg` |
| Short flows | Seeing the report time or source needs a tap into the player panel. The rows omit it. | `squad-sections.tsx:51-53,294-301` |
| Easy navigation | Same push-on-back, non-sticky collapse and phone-bar `‹` issues as the other sections. | `section-card.tsx:43-58`; `match-details.tsx:188` |
| Uniformity | `InjuryRow` (icon + name/meta + pill) is a third row style for players. The CTA wording differs from the sibling cards. | `squad-sections.tsx:276-282`; `en.ts:506` |
| Accuracy | The closed-card count uses the preview length (≤ 6), not the total. The error copy says "preview above" while the preview is hidden. | `squad-sections.tsx:293`; `section-card.tsx:34`; `en.ts:425` |
| Accuracy | A failed preview read is shown as "No absences are reported in the stored evidence.", which is a potentially misleading claim. | `match-detail-route.tsx:29-30`; `squad-sections.tsx:307` |

### 3.8 Must keep

- **URL state:** `section=injuries`, `team`, `tab` (out/doubtful/unknown), `page`, `item`, with the
  same push and replace rules as the other sections.
- **Status labels and colours:** "Out" (red), "Doubtful" (amber), "Status unclear" (blue). Always
  text plus colour, never colour alone.
- **Row meta:** "{Team} · {type} · {reason}", with null parts dropped.
- **Disclaimers:**
  - "From the provider injury list in this prediction's evidence. Return dates are shown only when the
    source gives one."
  - Panel row "Expected return — Not provided by the source". Never show estimated return dates.
- **Provenance:** "Reported {source} · {EAT time}" with `<time>`.
- **Empty messages:** "No absences match these filters." and "No absences are reported in the stored
  evidence."
- **Card accent:** red, with the plus icon. Card title "Injuries & Suspensions".

### 3.9 Sample data (populated)

- **Card:** meta "5 absences". Preview rows:

  | Name | Meta | Pill |
  | --- | --- | --- |
  | G. Jesus | Arsenal · Missing Fixture · Knee Injury | Out |
  | T. Tomiyasu | Arsenal · Missing Fixture · Knee Injury | Out |
  | W. Fofana | Chelsea · Missing Fixture · Hamstring Injury | Out |

- **Opened, Both teams + All statuses** adds two more rows:

  | Name | Meta | Pill |
  | --- | --- | --- |
  | R. James | Chelsea · Questionable · Muscle Injury | Doubtful |
  | M. Mudryk | Chelsea · Suspended | Status unclear (type null, reason "Suspended") |

- **Filter "Out"** gives 3 rows. **Team = Chelsea** gives 3 rows.
- **Item example (G. Jesus, `item=home-…`):**

  | Label | Value |
  | --- | --- |
  | Team | Arsenal |
  | Shirt number | — |
  | Position | Not available |
  | Lineup role | Not in the confirmed lineup |
  | Availability | [Out] Missing Fixture · Knee Injury |
  | Reported | API-Football · Oct 12, 2026, 09:30 EAT |
  | Expected return | Not provided by the source |

  Followed by the stats-missing note.

---

## 4. Cross-screen observations for the samples

1. **Three row patterns for one entity.**
   - Lineups: `PlayerRow`, number · name · code.
   - Players: `SquadRow`, avatar · name/meta · pill.
   - Injuries: `InjuryRow`, icon · name/meta · pill.

   All three open the same Player details panel. One shared row template, with slot variations,
   would serve Uniformity.
2. **The same frame for all three.** Each card uses the same frame (header disclosure, preview, "View
   …" link, breadcrumb, chips, list, pager, note, Collapse link) and the same Team chip group. Keep
   this frame identical across samples.
3. **Navigation exits.**
   - Exits are the breadcrumb (top), the header chevron (top), "Collapse …" (bottom only), "‹ Back to
     list" (item top), and browser Back.
   - The phone bar `‹` exits Match details entirely.
   - No control is sticky, and the fixed bottom tab bar is app-level ("Matches" active).
4. **History semantics are a documented contract** (`docs/match-details.md` § URL state):
   - Opening and closing a section or item pushes a history entry.
   - Filters and pages replace it.

   Samples may restyle the controls but must keep this mapping.
5. **Overlapping content.** Lineups ⊂ Players and Injuries ⊂ Players. All three sections exist today
   and must remain reachable with their own titles, counts, notes and URL ids.
6. **Phone container behaviour hides information in closed cards:** meta counts and "Confirmed", and
   the mini-pitch. If a sample shows counts on closed cards, use `preview.totals.players` /
   `totals.injuries`; that data already exists.
7. **No new features.** Do not add:
   - Search within players.
   - Sorting.
   - Player photos, ratings, stats or season data.
   - Managers.
   - Expected return dates.
   - Lineup "predicted" or provisional states.
   - Live refresh of squads.

   None of these exist.
