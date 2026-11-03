# Transient personal slips and published odds bands

- [x] Remove personal saved slips/history and storage; preserve up to ten filter presets.
- [x] Keep personal image exports in memory and new shared links tied to published Best Slips; preserve existing public links.
- [x] Publish up to twenty slips per band daily: 1.5–5, 5–10, 10–20, 20–50, 50–100.
- [x] Scope browsing, pagination and yesterday's summary to the selected band; preserve sealed legacy publications.
- [x] Put Custom date first in Slip date, keep floating labels visible and simplify centered builder feedback.
- [x] Verify publication/access rules, presets, migrations, JSON identity seals and both themes.

Validation: focused unit checks, isolated MySQL checks, TypeScript, lint for affected files, theme contract and migration contracts pass. Browser checks cover mobile and desktop in light and dark themes.

The owned local demo migration removed 99 personal saved slips and retained all 11 presets and 99 published slips. Production cleanup runs when the included deployment migration is applied. Existing sealed legacy days are not regenerated.
