# Contact page browser fixture

Run `python scripts/verify-contact-page-rendering.py --serve` from `next-js`.
The isolated production app renders the actual Contact content and Settings
editor with fictional numbers and `support@example.test`. It never reads a
business database or contacts an external recipient.

`POST /api/fixture` accepts `reset`, `unavailable`, and validated settings
`changes` for automatic-update and outage scenarios. `/api/admin/settings`
accepts the real editor's save request, updates the fixture process, and returns
the real settings data shape. These test-only routes are never production routes.
The fixture aliases the authenticated owner-refresh action to a local path
revalidation; production authorization remains in the production action.

Use `verifyContactPage(page, origin, outputDirectory)` from
`scripts/verify-contact-page.mjs` in a normal Node Playwright runner to exercise
the two themes and viewports, real settings saves, background polling, temporary
outages, and empty contact state. Save screenshots under `output/playwright/`.
Pass `{ layoutsOnly: true }` as the fourth argument to repeat only layout checks.

Playwright CLI is the first browser entry point. Its `run-code` VM does not
support dynamic module imports, so the verified fallback imports this helper in
normal Node and uses the Playwright library already installed with the CLI:

```js
import { chromium } from "<CLI runtime>/node_modules/playwright/index.mjs";
import { verifyContactPage } from "./scripts/verify-contact-page.mjs";

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await (await browser.newContext()).newPage();
  console.log(await verifyContactPage(page, origin, "output/playwright/contact"));
} finally { await browser.close(); }
```

Use the CLI runtime installed on the host and the local origin printed by the
fixture server. This uses the standard Playwright API and does not require
Playwright Test or another project dependency.
