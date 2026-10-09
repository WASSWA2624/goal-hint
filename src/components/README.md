# Browser components

Place reusable presentation components and browser interaction here. Modules that
use hooks, browser APIs or styled-components must declare `"use client"`.
Keep shared contracts in `@/domain`; obtain public data through server-rendered
props or public read endpoints. Never import server services, worker code or
credentials. The shared `ui/` modules and root styling provider are implemented
in prompt 015; state begins in 017. Reuse the [styling exports and contracts](../../docs/brand-styling.md)
for layout, brand images, controls and feedback. `dev/brand-demo.tsx` is imported
only in development and contains interface examples rather than football data.
