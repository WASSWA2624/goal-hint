# 075 Inline subscription expiry

For active subscribers, remove the status bar's redundant active heading and show
one shared sentence on phone, tablet and desktop:
`Expires on [date] at [time] (x days y hours left)` or
`Expires on [date] at [time] (x hrs y min left)` below 24 hours.

Reuse EAT expiry formatting, retain a truthful under-one-minute fallback, and keep
payment/renewal notices and the account page's existing summary. Verify duration
boundaries, types, lint and rendered responsive bars with synthetic subscriptions.

See [development progress](../docs/development-progress.md) for executed checks.
