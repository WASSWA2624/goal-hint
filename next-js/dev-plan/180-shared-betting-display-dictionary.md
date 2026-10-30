# 180 — Shared betting display dictionary

Centralize current and future football market, metric, period, participant,
prediction and field short forms in `src/domain/betting-short-forms.ts`.
The 136 entries distinguish familiar shorthand from readable application labels;
bookmakers do not share one universal abbreviation standard.

`compactMarketName`, prediction aliases and default localized prediction/field
codes use this dictionary. Existing structured prediction rules still preserve
every exact score, goal line, sign, team, event and combination. Explicit market
identity fields compose labels for corners, cards, booking points, player and
other future markets. Unknown terminology retains its supplied full name.

This adds presentation vocabulary, without enabling a market or changing
forecast eligibility, settlement, counting rules, prices or access policies.
The documented glossary is `docs/betting-short-forms.md`, with primary-source
terminology references and examples. Tests cover all currently declared metrics
and periods, current market integration, aliases, future compositions, unknown
identities and translation overrides.
