# Mobile slip headers

Mobile slips use the selected **Compact Rail** header in Best slips, generated
slips, completed history, shared snapshots and aggregate-only access summaries. Desktop headers use
their existing presentation, with the separately requested larger rounded
disclosure indicator. The Clean ledger match rows are unchanged.

Mobile slips start collapsed unless the caller explicitly requests an open
snapshot, such as a shared slip. Tapping
anywhere on the header expands or collapses its own slip through the shared native
`details`/`summary` disclosure, including Slip Builder, Best slips, completed
history and performance slips. Access-limited summaries use the same behavior.

`SlipCard` and `SlipCardSummary` choose the same `CompactSlipDisclosure` and
`MobileSlipHeader` for Clean ledger. The shared phone frame has a thin blue rail
and `theme.radius.control` corners. Header padding is 6px vertically and 8px
on the starting edge; the arrow column owns the ending space. The first line groups a subtly blue-styled Slip N with a pipe and
the generation timestamp. The uniform status badge sits on the right before
the chevron. The arrow has its own separated column spanning the header; the
bottom line keeps labelled odds, probability and match count to its left, with
no figure below the arrow. On narrow cards the identity/date group wraps.
Figures use 14px text and supporting labels 11px. The full
localized title and mean-probability explanation remain accessible.

The mobile indicator is a 20px circle with a visible border and blue background,
centered in a 32px column with balanced edge spacing. The full native summary
remains the click/tap and keyboard target; no nested button competes with it.

When timestamp metadata exists, the header shows the actual EAT
weekday followed by a bold date/time, for example Fri **30 Oct 2026 · 09:16 EAT**.
Best slips use the persisted immutable daily snapshot timestamp; builder slips
use their generation result's `asOf` without changing desktop headers. History
retains its recorded save timestamp. Date-only records do not invent a clock.
The body does not repeat a Published timestamp.

Every status reuses the desktop badge's 5.75rem width, colours and animated
in-progress dot. Narrow cards use `Prob.`. Facts can wrap at enlarged text sizes
without widening the page. Native disclosure controls retain keyboard operation
and a minimum 44px target. Shared match rows remain unchanged.

Probability remains the mean of individual selection probabilities, with its
existing accessible explanation. Header status reuses `slipOutcome`: a verified
loss wins precedence, unresolved selections remain Pending, and completed slips
show Won or Void. Results belong to the original selection; current match states
must pass `slipMatchStateForSelection` identity checks. Aggregate-only summaries
default to Pending and need no private selection data.

The historical comparison at `/en/slips/designs/headers` reuses the header markup
and base styles. Its original variant sizes are isolated from the production
readability adjustment.
