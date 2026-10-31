# 185 — Full-width desktop sections

Align desktop page sections with the full-width header and subscription bar.
Remove horizontal page gutters and desktop width caps from application feeds,
match details and owner workspaces. Keep padding inside filters, summaries,
headings, notices and text sections. Reading pages and compact forms retain
their local content insets.

Reuse `desktopSectionFrame` for straight desktop section edges, including
Overall Performance, match boards, shared surfaces, loading placeholders and
owner/analytics panels. Keep control, menu and dialog corners independent.
Preserve all phone/tablet spacing and corner rules below 64rem.

Verify 1024px, 1440px and 1920px layouts in both themes, section edges and
horizontal overflow. Compare phone/tablet geometry with the original revision
at 320px, 375px, 768px and 1023px. Use isolated real-component previews when
the running data-backed server cannot finish a page request, and record that
limit separately from layout acceptance. Run changed-file lint, strict type
checking and the relevant existing component/domain tests.

Completed: changed-file ESLint with zero warnings, strict TypeScript checking
and 141 relevant tests passed under Node 24.18.1. Forty-eight isolated desktop
cases and 64 original-versus-current phone/tablet comparisons passed in both
themes. The progress log records the preview coverage and live-server limits.
