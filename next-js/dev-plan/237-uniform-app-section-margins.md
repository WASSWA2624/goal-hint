# Uniform outer margins for headers and main app sections

- Let the shared app shell own one 16px outer gutter at every screen width.
- Make containers, desktop section rails and compact phone headers consume the
  shell gutter once, with standalone component fallbacks retained.
- Remove viewport-bleed margins from match-detail sections inside the shell.
- Use the same header insets for public, member and administrator screens.
- Verify both themes at phone, tablet and desktop widths; commit and push main.

Verification: in progress.
