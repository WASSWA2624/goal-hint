# Theme rendering acceptance fixture

Run `npm run test:theme:rendering -- --serve` from `next-js/`. The script builds an
isolated production fixture and prints its local browser URL. It reuses the real
root layout, style provider, public shell, navigation, phone header, match cards,
slip table, overall performance summary, controls, dialog and payment step components.
All records are synthetic.

Use the visible shared header toggle to switch themes. At phone (390px), tablet
(768px) and desktop (1440px) widths, `[data-theme-check-result]` should become
`passed`; `[data-checked-mode]` and `[data-checked-width]` identify that completed
check. `[data-theme-fixture][data-theme-mode]` exposes the provider's current mode.
The checks run after switching modes and resizing; `[data-run-theme-checks]` runs
them explicitly. Reload to verify persistence, and use a fresh browser profile to
verify the operating system preference.

Stable scopes for additional computed-style assertions: `[data-app-header]`,
`#theme-phone-header`, `#theme-controls`, `#theme-control-input`,
`#theme-control-select`, `#theme-member-step`, `#theme-matches [data-fixture-id]`,
`#theme-slips [data-slip-id]`, `[data-slip-summary]`, `[data-pick-state]`,
`#theme-performance [data-summary-outcome]` and
`#theme-dialog`. `[data-open-theme-dialog]` opens the real modal dialog.

The fixture checks surface equality, adaptive branding, homogeneous neutral fills,
mobile slip number panels and desktop table headers. It also checks shared surface
borders, phone match/slip frames, and the Won, Lost and Pending performance fills,
labels, numbers and icons against their semantic theme colors. The light-header
and dark phone-card assertions independently catch the reported mixed-theme
regressions.
