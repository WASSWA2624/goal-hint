# Browser components

Place reusable presentation components and browser interaction here. Modules that
use hooks, browser APIs or styled-components must declare `"use client"`.
Keep shared contracts in `@/domain`; obtain public data through server-rendered
props or public read endpoints. Never import server services, worker code or
credentials. The shared `ui/` modules and root styling provider are implemented
in prompt 015; state begins in 017. Reuse the [styling exports and contracts](../../docs/brand-styling.md)
for layout, brand images, controls and feedback. `dev/brand-demo.tsx` retains the
earlier interface examples and is no longer mounted on public pages. The
isolated styling acceptance fixture supplies its own demonstration controls.

`navigation/` contains the shared shell styles from prompt 016. Server page
composition lives in `src/app/_components/`. Reuse the route contracts in
`@/domain/navigation` and messages in `@/i18n/messages`. The component preview is
no longer mounted on a public homepage.
