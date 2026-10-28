# Prediction outcomes

Match cards, slip matches and prediction columns use `predictionLabel` for a short
outcome and `predictionDescription` for its meaning. `predictionOutcome` returns
both from the same selection and optional structured market context. Display
codes never replace stored selection identifiers or settlement rules.

| Market | Display | Meaning |
| --- | --- | --- |
| Match result | `1`, `X`, `2` | Home win, draw, away win |
| Double chance | `1X`, `X2`, `12` | Home or draw, away or draw, home or away |
| Totals | `O 2.5`, `U 2.5` | Over or under the stated line |
| Both teams score | `Yes`, `No` | Both teams score at least once, or at least one team does not score |
| Clean sheet / win to nil | `Yes`, `No` | Answers the specified team's market |
| Asian handicap | `1 -0.25`, `2 +0.25` | The selected side and its signed handicap |
| Handicap result | `1`, `X`, `2` | The result after the market's handicap |
| Exact score | `2:1` | Home score followed by away score |
| Half / full result | `X / 2` | Half-time result followed by full-time result |
| Odd / even | `Odd`, `Even` | Parity of the market's count |
| Exact count | `= 3` | Exactly the stated count |
| Other score / count / outcomes | `Other` | The complement of the outcomes defined by the market |
| Event occurs | `Yes`, `No` | Whether the specified event occurs |
| Event team | `1`, `2`, `None` | Home team, away team or no event |
| Combined outcomes | `1 & O 2.5` | All stated outcomes must occur |

Every dynamic total, score, count and signed handicap retains its actual value.
Structured rules take precedence over source labels and generic aliases, so an
exact count of `1` cannot become a home-win prediction. Unmapped source
combinations retain their stated label instead of guessing an abbreviation.

Cards retain the market name beside the short prediction, a full definition in
the prediction tooltip, and a descriptive screen-reader label. Detail prediction
rows use the shared `PredictionOutcome` component. The expandable **Prediction
key** provides touch-accessible definitions for all ten core card outcomes.

`predictionRuleLabel` remains descriptive for stored market definitions, sealed
source envelopes and public semantic contracts. Compact presentation is a
separate formatting concern.
