# Match Details Studio

Ten interactive desktop design alternatives for the same match-detail screen.

From `next-js/`, run:

```powershell
npm run design:match-details
```

Open [Match Details Studio](http://127.0.0.1:3111/). Keep the process running
while reviewing. Use `-- --port 3112` if the default port is occupied.

## Reviewing

- Select a design in the left navigator or the top dropdown. Previous/next
  buttons and **Alt + Left/Right** also switch designs.
- **Viewing as** previews a subscriber, visitor, unsubscribed member, or member
  with active referral access. **Match status** previews upcoming, live,
  completed, and postponed fixtures.
- Changes preserve the selected information tab, viewer and fixture status.
  Copy the review link to retain those four values, including after refresh.
  Back/Forward restores earlier review states.
- Star designs to shortlist them; the star filter shows shortlisted designs.
  The notes button saves feedback per design in review-specific local storage.
- **Focus preview** hides the design navigator. The top dropdown stays available.
- Select the eight tabs to explore the whole screen. Arrow keys follow the
  orientation of the tab list; Home/End choose the first/last tab. Tabs remain
  visible while scrolling long sections.

Review at 1280px or wider. A narrower window keeps the desktop canvas scrollable.
The designs share Manrope, the existing logo and semantic radius tokens. Manrope
and all illustrations are local; no fonts, images or data need an external CDN.

| # | Design | Composition |
| --- | --- | --- |
| 01 | Touchline | Familiar scoreboard, prediction strip, underline tabs |
| 02 | Floodlight | Dark broadcast scoreboard, segmented navigation |
| 03 | Clubhouse | Green section rail, stacked team identities |
| 04 | Matchday | Editorial masthead, ink-blue brief, numbered chapters |
| 05 | Analyst | Compact score ribbon, prediction cells, dense comparisons |
| 06 | Pitchside | Stadium-green banner, field-marker navigation |
| 07 | Dugout | Cyan workspace, grouped vertical index |
| 08 | Scorebook | Joined square ledger, tabular navigation |
| 09 | Pressbox | Warm two-tone masthead, generous chapter rail |
| 10 | Nightwatch | Charcoal workspace, mint signal, integrated index |

## Content ownership

The scoreboard owns fixture identity and status. The featured section owns its
selection and explanation. That selection is excluded from the market table.
Statistics owns recent form and team comparison; Head-to-head owns only direct
meetings; Standings owns the competition table; Lineups owns the two formation
pitches, players, substitutes and managers; Events owns the timeline; Venue
owns the ground, conditions and officials; Analysis owns reporting, result
scenarios and source provenance. Probability values are not repeated in the
qualitative scenario explanations.

Subscription and referral guidance belongs to one shared access panel above
the tabs. Locked markets and predictive analysis link back to that panel.

The lineup selector changes shirt number, age or previous-appearance rating
without moving players or hiding their names. Player buttons open profiles.
Portraits have shirt fallbacks. Upcoming lineups are labeled provisional;
events and current-match statistics are absent until the match starts.
Head-to-head filters cover the previous three seasons or up to 20 available
meetings, competition and ground. There are 12 sample meetings, not 20 invented
records. Missing odds remain unavailable. Market explanations, categories,
live statistics, event filters and source disclosures work interactively.

## Access and scope

The local server projects the sample data for the selected viewer and status.
Completed fixtures use the production canonical status helper and are public.
Upcoming/live/postponed predictions require a subscription or earned referral
entitlement. A locked response excludes selections, prediction probabilities,
odds, explanations and predictive scenarios; public descriptive statistics and
reporting remain available. Missing/invalid API viewers default to a visitor.
Only allowlisted assets are served; the private sample module is not served.
Responses are uncached. Changing access state clears the previous screen before
the next response, and aborts superseded requests.

This is an explicitly local design sandbox with simulated identity. Its viewer
query parameter is a review control, **not authentication**. It does not change
production routes, account authorization, payment services, provider collection,
or odds-display rights. Account and referral buttons explain the intended
journey in a preview dialog. The existing one-day referral reward requires an
eligible new registration followed by phone verification.

All fixture facts, results, rosters, names, ratings, forecasts, news, odds and
source categories are illustrative. The crest monograms, pitch, stadium and
role artwork are original SVG UI illustrations. No real player portraits or
live reporting are claimed. News and AI-assisted text are sample content;
production publication requires the actual verified source links.

## Verification

`node --conditions=react-server --test tests/match-detail-designs.test.mjs`
checks the HTTP access matrix, source isolation, missing odds and unique featured
selection. The existing completed-match-access tests cover production gating.

`scripts/verify-match-detail-designs.mjs` exports `verifyMatchDetailDesigns(page,
options)` for an existing Playwright Page. Its layout phase checks all ten
designs and eight tabs at the selected desktop width; its access phase covers
the four viewers and four match states; its interaction phase checks the review
workflow and working match controls. Captures belong in ignored
`output/playwright/match-details/`.
