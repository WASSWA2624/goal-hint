# Betting display dictionary

This is the shared football display vocabulary in `src/domain/betting-short-forms.ts`. Current match/slip cards use its market codes and prediction templates through the existing localized formatters. Future markets compose the same vocabulary from explicit period, participant, metric and market fields.

This catalog defines display text; it does not enable a market, infer a selection, change prices/probabilities, or define settlement. Arbitrary provider-specific combinations remain extensible. Unknown terminology retains its supplied full label.

Bookmaker terminology varies by region and provider. `common` marks familiar betting/statistical shorthand; `readable` marks an explicit Goal Hint display label where a single international abbreviation is not established. These labels are not claimed to be an official universal standard.

## Examples

- `1X2` with `1`: match result, home win.
- `DC` with `X2`: double chance, draw or away win.
- `O/U` with `U 2.5`: under the exact stated goal line.
- `1H H Corn. O/U 4.5`: first-half home-team corner total.
- `FT YC AH -1.25`: regulation-time yellow-card Asian handicap.
- `ET P SOT`: player shots on target in extra time.

Participant labels H/A identify a team; selection codes 1/2 identify the home/away choice in its stated market. Card counts and booking points remain distinct. FT, first-half and ET periods are explicit. The first-half betting period is 1H; the live halftime phase remains HT. Full translated descriptions and exact signed/quarter lines accompany compact selections.

## Markets

| Identity | Short form | Meaning | Convention |
| --- | --- | --- | --- |
| `match-result` | `1X2` | Match result | common |
| `double-chance` | `DC` | Double chance | common |
| `total-goals` | `O/U` | Total goals over/under | common |
| `totals` | `O/U` | Over/under the stated total | common |
| `both-teams-to-score` | `BTTS` | Both teams to score | common |
| `draw-no-bet` | `DNB` | Draw no bet | common |
| `asian-handicap` | `AH` | Asian handicap | common |
| `european-handicap` | `EH` | European three-way handicap | common |
| `handicap-result` | `EH` | Three-way handicap result | common |
| `handicap` | `Hcap` | Handicap | readable |
| `asian-total` | `Asian O/U` | Asian total with the stated payout line | readable |
| `half-full-result` | `HT/FT` | Half-time/full-time result | common |
| `exact-score` | `Score` | Correct score | readable |
| `correct-score` | `Score` | Correct score | readable |
| `exact-count` | `Exact` | Exact event count | readable |
| `odd-even` | `Odd/Even` | Odd/even total | common |
| `clean-sheet` | `CS` | Team clean sheet | common |
| `win-to-nil` | `WTN` | Team to win without conceding | common |
| `team-total` | `Team O/U` | Team total over/under | readable |
| `winning-margin` | `Margin` | Winning margin | readable |
| `to-qualify` | `Qualify` | Team to qualify | readable |
| `to-lift-trophy` | `Trophy` | Team to lift the trophy | readable |
| `outright` | `Winner` | Competition or tournament winner | readable |
| `top-scorer` | `Top scorer` | Competition top goalscorer | readable |
| `group-winner` | `Group win` | Group winner | readable |
| `top-finish` | `Top N` | Finish in the stated top positions | readable |
| `relegation` | `Releg.` | Team to be relegated | readable |
| `promotion` | `Prom.` | Team to be promoted | readable |
| `first-goalscorer` | `FGS` | First goalscorer | common |
| `last-goalscorer` | `LGS` | Last goalscorer | common |
| `anytime-goalscorer` | `AGS` | Anytime goalscorer | common |
| `player-goals` | `P Goals` | Player goals | readable |
| `player-assists` | `P Ast` | Player assists | readable |
| `player-shots` | `P Shots` | Player shots | readable |
| `player-shots-on-target` | `P SOT` | Player shots on target | readable |
| `player-card` | `P Card` | Player to receive a card | readable |
| `player-red-card` | `P RC` | Player to receive a red card | readable |
| `player-tackles` | `P Tkl` | Player tackles | readable |
| `player-saves` | `P Saves` | Player goalkeeper saves | readable |
| `player-passes` | `P Pass` | Player passes | readable |
| `player-fouls` | `P Fouls` | Player fouls | readable |
| `player-offside` | `P Offs` | Player offsides | readable |
| `event-any` | `Any` | Whether the specified event occurs | readable |
| `event-first` | `First` | Whether the specified first event occurs | readable |
| `event-last` | `Last` | Whether the specified last event occurs | readable |
| `first-event-team` | `First` | Team responsible for the first specified event | readable |
| `last-event-team` | `Last` | Team responsible for the last specified event | readable |
| `next-event-team` | `Next` | Team responsible for the next specified event | readable |
| `race-to` | `Race to` | First team to the stated event count | readable |
| `time-of-event` | `Time` | Time of the specified event | readable |
| `highest-scoring-half` | `High half` | Highest-scoring half | readable |
| `win-both-halves` | `Win both` | Team to win both halves | readable |
| `win-either-half` | `Win half` | Team to win either half | readable |
| `score-both-halves` | `Score both` | Team to score in both halves | readable |
| `result-btts` | `1X2+BTTS` | Match result and both teams to score | readable |
| `result-total` | `1X2+O/U` | Match result and the stated total | readable |
| `btts-total` | `BTTS+O/U` | Both teams to score and the stated total | readable |
| `combination` | `Combo` | Explicitly defined combination of selections | readable |

## Metrics

| Identity | Short form | Meaning | Convention |
| --- | --- | --- | --- |
| `goals` | `Goals` | Goals | readable |
| `assists` | `Ast` | Assists | readable |
| `corners` | `Corn.` | Corners | readable |
| `cards` | `Cards` | Total cards | readable |
| `yellow-cards` | `YC` | Yellow cards | common |
| `red-cards` | `RC` | Red cards | common |
| `booking-points` | `BP` | Booking points | common |
| `shots-on-goal` | `SOT` | Shots on target | common |
| `shots-on-target` | `SOT` | Shots on target | common |
| `shots-off-goal` | `Sh. off` | Shots off target | readable |
| `total-shots` | `Shots` | Total shots | readable |
| `blocked-shots` | `Blk sh.` | Blocked shots | readable |
| `shots-inside-box` | `Sh. in box` | Shots inside the penalty area | readable |
| `shots-outside-box` | `Sh. out box` | Shots outside the penalty area | readable |
| `fouls` | `Fouls` | Fouls | readable |
| `offsides` | `Offs.` | Offsides | readable |
| `goalkeeper-saves` | `Saves` | Goalkeeper saves | readable |
| `total-passes` | `Passes` | Total passes | readable |
| `accurate-passes` | `Acc. pass` | Accurate passes | readable |
| `throw-ins` | `Throw-ins` | Throw-ins | readable |
| `goal-kicks` | `GKicks` | Goal kicks | readable |
| `penalties` | `Pens` | Penalties | readable |
| `free-kicks` | `FK` | Free kicks | common |
| `tackles` | `Tkl` | Tackles | readable |
| `interceptions` | `Int.` | Interceptions | readable |
| `clearances` | `Clr` | Clearances | readable |
| `possession` | `Poss.%` | Possession percentage | readable |
| `attacks` | `Att.` | Attacks | readable |
| `dangerous-attacks` | `Danger att.` | Dangerous attacks | readable |
| `substitutions` | `Subs` | Substitutions | readable |
| `woodwork` | `Woodwork` | Shots hitting the woodwork | readable |
| `own-goals` | `OG` | Own goals | common |
| `goal-kick-distance` | `GK dist.` | Goal-kick distance | readable |

## Periods

| Identity | Short form | Meaning | Convention |
| --- | --- | --- | --- |
| `full-time` | `FT` | Regulation time, including added time | common |
| `half-time` | `1H` | First-half betting period | common |
| `first-half` | `1H` | First half | common |
| `second-half` | `2H` | Second half | common |
| `extra-time` | `ET` | Extra time | common |
| `including-extra-time` | `Incl. ET` | Including extra time | readable |
| `extra-time-first-half` | `ET 1H` | First half of extra time | readable |
| `extra-time-second-half` | `ET 2H` | Second half of extra time | readable |
| `penalties` | `Pens` | Penalty shootout | readable |
| `rest-of-match` | `Rest` | Remainder of the match | readable |

## Participants

| Identity | Short form | Meaning | Convention |
| --- | --- | --- | --- |
| `home` | `H` | Home team | common |
| `away` | `A` | Away team | common |
| `total` | `Total` | Both teams combined | readable |
| `player` | `P` | Named player | readable |
| `goalkeeper` | `GK` | Named goalkeeper | common |
| `either` | `Either` | Either team | readable |
| `both` | `Both` | Both teams | readable |

## Predictions

| Identity | Short form | Meaning | Convention |
| --- | --- | --- | --- |
| `home-win` | `1` | Home win | common |
| `draw` | `X` | Draw | common |
| `away-win` | `2` | Away win | common |
| `home-or-draw` | `1X` | Home win or draw | common |
| `away-or-draw` | `X2` | Draw or away win | common |
| `home-or-away` | `12` | Either team wins | common |
| `over` | `O {line}` | Over the stated line | common |
| `under` | `U {line}` | Under the stated line | common |
| `home-handicap` | `1 {line}` | Home selection with its signed handicap | common |
| `away-handicap` | `2 {line}` | Away selection with its signed handicap | common |
| `yes` | `Yes` | The market's specified event occurs | common |
| `no` | `No` | The market's specified event does not occur | common |
| `odd` | `Odd` | Odd total | common |
| `even` | `Even` | Even total | common |
| `exact-score` | `{home}:{away}` | Exact home and away score | common |
| `exact-count` | `= {count}` | Exactly the stated count | readable |
| `at-least` | `{count}+` | At least the stated count | common |
| `half-full` | `{half} / {full}` | First-half selection followed by full-time selection | common |
| `and` | `&` | All explicitly combined selections | common |
| `other` | `Other` | The explicitly defined remaining selections | readable |
| `home-team` | `1` | Home team for the stated event | common |
| `away-team` | `2` | Away team for the stated event | common |
| `no-event` | `None` | No specified event | readable |

## Fields

| Identity | Short form | Meaning | Convention |
| --- | --- | --- | --- |
| `odds` | `Odds` | Decimal odds | readable |
| `probability` | `Prob.` | Estimated probability | readable |
| `market` | `Mkt` | Market | readable |
| `prediction` | `Pick` | Prediction | readable |
| `number` | `No.` | Match number | readable |

## Terminology references

Reviewed 30 October 2026:

- [The Odds API market catalog](https://the-odds-api.com/sports-odds-data/betting-markets.html): market identities and provider terminology differences, including football team/player/corner/card and period markets.
- [Betfair betting glossary](https://betting.betfair.com/betting-explained/glossary-of-betting-terms-120124-200.html): familiar football market terminology.
- [Sportsbet double-chance and draw-no-bet help](https://helpcentre.sportsbet.com.au/hc/en-us/articles/18432184962445-Double-Chance-Draw-No-Bet-Soccer-Markets): distinct market meanings and regulation-time scope.
- [Betfair football rules](https://support.betfair.com/app/answers/detail/a_id/10555/): market-specific counting and period distinctions; those rules are not imported as Goal Hint settlement policy.

Coverage is checked against every metric and period already declared by Goal Hint. Structured market/prediction formatters compose additional lines, scopes, periods and combinations without an ever-growing list of copied strings.
