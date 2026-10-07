# Browser components

Place reusable presentation components and browser interaction here. Modules that
use hooks, browser APIs or styled-components must declare `"use client"`.
Keep shared contracts in `@/domain`; obtain public data through server-rendered
props or public read endpoints. Never import server services, worker code or
credentials. Styling and state providers begin in prompts 015 and 017.
