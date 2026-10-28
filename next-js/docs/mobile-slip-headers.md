# Mobile slip headers

Mobile slips use the selected **09 Minimal rules** header in Best slips, generated
slips, completed history and aggregate-only access summaries. Desktop headers use
their existing presentation. The Clean ledger match rows are unchanged.

`CompactSlipDisclosure` selects the shared `MobileSlipHeader` for Clean ledger.
Its minimum 44px row contains the slip number, odds, probability, match count
and status in five side-by-side columns. Figures and status use 14px text; metric
labels use 12px text above their figures. The aggregate price is labeled Total
odds. The first column shows only the centered slip number in 16px extra-bold
text; three-digit numbers retain a fitting 14px size and the same extra-bold
weight. Its accessible heading retains the full localized Slip N title. Status
uses the same label-above-value arrangement as the other columns. Metric/status
cells have 4px vertical and 2px horizontal padding.

At the default text size, the identity/odds/matches/status/chevron tracks are
32/80/56/62/10px. Probability receives the remaining width with a 58px minimum.
Every status has the same width. Narrow containers use `Prob.`; large odds retain
their full figures at the normal 14px size. Enlarged text can scroll locally
without widening the page. Native disclosure controls retain keyboard operation
and a minimum 44px target. Text and minimum height scale with the root font size.

Probability remains the mean of individual selection probabilities, with its
existing accessible explanation. Header status reuses `slipOutcome`: a verified
loss wins precedence, unresolved selections remain Pending, and completed slips
show Won or Void. Results belong to the original selection; current match states
must pass `slipMatchStateForSelection` identity checks. Aggregate-only summaries
default to Pending and need no private selection data.

The historical comparison at `/en/slips/designs/headers` reuses the header markup
and base styles. Its original variant sizes are isolated from the production
readability adjustment.
