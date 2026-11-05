# Menu order, labels and Builder icon

- Desktop and mobile consume one ordered navigation configuration: Matches, Slips, Builder, Community, Invite friends, Performance, Download app, Contact, Help, Privacy, Terms.
- Slips, Builder and Performance are navigation labels; canonical routes and page titles remain intact.
- Community reuses the shared group-of-people icon and its existing visibility rules.
- Builder uses a shared wrench icon, visually distinct from the Slips document icon in desktop, mobile and More navigation.
- Overflow preserves the same order. Administrator Dashboard remains an additional authorized destination.
- Footer information links follow Contact, Help, Privacy, Terms.
- Verification passed: 24 focused navigation tests, targeted lint and integrated type checking. Actual desktop/mobile DOM order, overflow labels and the Community SVG were checked in both themes at 390px and 1440px, with screenshots visually reviewed.

Builder icon follow-up passed the 19 existing navigation tests and targeted lint. Wrench/document glyphs were visually checked in light and dark themes at 390px and 1440px, including forced desktop/mobile More overflow; all checks were read-only.
