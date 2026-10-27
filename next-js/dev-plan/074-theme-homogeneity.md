# 074 Theme homogeneity

Apply the selected light or dark palette consistently across the shared web app.

1. Give light mode white page/header/navigation surfaces and dark mode dark surfaces, using the existing semantic theme contract.
2. Remove fixed light palettes from phone match/slip cards and glyphs. Keep meaningful market/status accents readable in both modes.
3. Adapt shared logos, payment-step markers, menus, dialogs, charts and squad details. Cache both logo/mark variants for offline use.
4. Verify contrast, actual rendered phone/desktop styles, runtime switching and reload persistence with synthetic data; run lint, typecheck, units, script checks and the production build.
5. Record actual verification, commit and push `main`. Keep production configuration, data and deployment unchanged.

See [development progress](../docs/development-progress.md) for acceptance results.
