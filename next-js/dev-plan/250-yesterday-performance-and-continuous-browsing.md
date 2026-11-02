# Yesterday performance and continuous browsing

## Behaviour

- Best Slips and Matches open on today back through the previous 29 days, newest
  first. Explicit date filters can select a different period.
- Their entry summaries use yesterday in EAT, independently of the displayed
  page. Yesterday's unfinished predictions remain pending. All, Won, Lost,
  Pending, Void and Cancelled remain visible, including zero counts.
- Best Slips outcome buttons select yesterday and that outcome when the entry
  summary is showing yesterday. Explicit date selections use whole-period counts.
- Lists load 20 results at a time. Near the bottom, the next batch loads without
  moving keyboard focus. Load more remains available as a native button;
  numbered pagination jumps directly to a page. Counts describe the loaded range
  and the full filtered total.
- Retain a bounded window of cards during continuous browsing, preserving a
  visible scroll anchor as older batches leave the DOM. Reconcile membership,
  access and duplicate identities before accepting another page.
- Slip builder's generated output has its own 20-item batches and page jumps.
  Signed-in members additionally get their own saved-slip history and yesterday
  performance. Generated output is not presented as historical performance.

## Data and access

- Reuse original-selection adjudication and the existing prediction projection.
- Every personal-history SQL batch includes the account predicate. Recheck the
  session and access at the response boundary and use private, no-store responses.
- Personal history has no public Best Slip share link. Unfinished selections
  remain gated when the subscription expires.
- Shared theme colours, spacing, radius and controls serve both themes and layouts.

## Verification

- 259 focused query, paging, performance, original-cycle and access tests passed,
  including account ownership/session changes and audited cancellations.
- TypeScript, targeted lint and the shared theme contract passed.
- 26 browser checks passed with isolated data in both themes, including 320px,
  390px and desktop layouts, automatic loading, page jumps, saved history and
  generated-result pagination. Focused result controls retain readable contrast.
- Yesterday uses the EAT reporting day even when the device is on another date;
  a failed summary read preserves the browsing page and leaves counts unavailable.
