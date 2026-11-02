# Uniform outer margins for headers and main app sections

- Let the shared app shell own one 16px outer gutter at every screen width.
- Make containers, desktop section rails and compact phone headers consume the
  shell gutter once, with standalone component fallbacks retained.
- Remove viewport-bleed margins from match-detail sections inside the shell.
- Use the same header insets for public, member and administrator screens.
- Verify both themes at phone, tablet and desktop widths; commit and push main.

Verification passed after the shared dependency repair:

- Lint on the changed layout, header and match-detail components and browser audit.
- Optimized production preview build with strict TypeScript checking; the shell's
  audit data attribute has an explicit prop type accepted by styled-components.
- 120 screen cases: all 12 preview screens in both active themes at 320, 390,
  768, 1024 and 1440px. Header, main and footer margins match the shared gutter;
  no horizontal overflow, parent-boundary violations or browser errors.
- 10 additional match-detail cases across the same themes and widths. Header,
  scoreboard, detail sections and footer follow the same 16px outer rails.
- Desktop and phone screenshots reviewed. The original viewport-bleed section
  margins are removed, with standalone component fallbacks retained.
