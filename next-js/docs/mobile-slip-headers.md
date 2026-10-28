# Mobile slip headers

Mobile slips use the selected **09 Minimal rules** header in Best slips, generated
slips, completed history and aggregate-only access summaries. Desktop headers use
their existing presentation. The Clean ledger match rows are unchanged.

`CompactSlipDisclosure` selects the shared `MobileSlipHeader` for Clean ledger.
Its 28px row contains the slip number, odds, probability, match count and status.
Each metric/status cell has 3px horizontal padding, the identity has 2px, and
vertical padding is zero. The odds track is 64px and every status has the same
50px track. Narrow containers use `Prob.`; enlarged text can scroll locally
without widening the page. Native disclosure controls retain keyboard operation.

Probability remains the mean of individual selection probabilities, with its
existing accessible explanation. Header status reuses `slipOutcome`: a verified
loss wins precedence, unresolved selections remain Pending, and completed slips
show Won or Void. Results belong to the original selection; current match states
must pass `slipMatchStateForSelection` identity checks. Aggregate-only summaries
default to Pending and need no private selection data.

The comparison at `/en/slips/designs/headers` reuses the production header markup
and base styles, with variant styles isolated to that review.
