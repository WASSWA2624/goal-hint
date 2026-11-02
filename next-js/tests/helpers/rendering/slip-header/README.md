# Slip-header bounds

Run `python scripts/verify-slip-header-rendering.py --serve` from `next-js/`.
The fixture renders real open/closed slips, long team names, a slip without Share
and a non-collapsible summary. All records and the account projection are synthetic.

`verifySlipHeaderControls` in `scripts/verify-slip-header-controls.mjs` checks
matching frame sizes, aligned tops, independent controls, positive inset on
every edge and functioning native disclosure. Run it with fine/coarse pointer
contexts in both themes. Route `/api/account/session` to an anonymous projection
and pass `false` as the fourth argument to repeat the checks with Share disabled.
