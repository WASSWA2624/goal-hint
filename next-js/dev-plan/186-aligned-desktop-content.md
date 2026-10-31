# 186 — Aligned desktop content

Keep desktop section backgrounds and structural frames full width, with a
consistent content gutter inside them. Match boards and slip cards must align
with filter controls, performance headings, notes and page navigation instead
of touching the viewport edges. Phone and tablet layout stays unchanged.

Reuse `theme.layout.gutter` (16px) through `desktopContentPadding`. Bordered
panels subtract their own border width so their content shares the same rail.
Use `DesktopContent` around collections or standalone shared slips; keep the
gutter outside each card so nested card content does not receive another page
inset. Apply the same alignment to generated slips, history, loading states,
offline matches, performance and owner/analytics content.

Verify full-width section frames and aligned content at 1024px, 1440px and
1920px in Light/Dark. Compare the original and updated mobile/tablet geometry
at 320px, 375px, 768px and 1023px. Run changed-file lint, strict type checking
and relevant existing tests, then record actual coverage and limitations.

Completed: changed-file lint, strict type checking and 151 existing tests
passed. Sixty-six desktop layout/theme cases and 88 original-versus-current
mobile/tablet comparisons passed using isolated component previews. A live
server-rendered Builder check passed; Matches and Best Slips navigation timed
out. See the development progress log for the precise browser coverage.
