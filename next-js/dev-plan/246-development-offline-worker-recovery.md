# 246 · Restore the normal app in development

- Serve a development-only retirement worker at the existing offline-worker URL
  before public-file resolution, so cached documents can recover without new
  application JavaScript running first.
- Activate the replacement, unregister it, remove only Goal Hint offline caches
  and reload its app tabs. Preserve unrelated storage and production offline support.
- Have loaded development pages request an existing Goal Hint worker update,
  without registering a new worker.
- Verify worker lifecycle, storage boundaries, production exclusion and recovery
  from a previously controlled saved page in a real browser.

## Verification

- Eight new regression checks passed, covering development rewrite precedence,
  production/test exclusion, worker activation/unregistration, scoped cache
  removal, unavailable storage, closed tabs and existing-registration updates.
- Chrome reproduced a saved page controlled by a stale worker. A normal reload
  fetched the replacement and recovered without any application JavaScript in
  the saved document. The registration and owned caches were removed; cookies,
  local storage, unrelated cached content and the current URL were preserved.
  A second reload stayed online. The real `http://localhost:3000/` opened `/en`
  with the normal Best Slips interface and no registered worker.
- TypeScript validation, scoped application/test ESLint and the shared theme
  contract passed. No UI styling changed.
- The wider offline suite passed 69 of 70 checks, including every production
  worker check. Its existing projection expectation omits `completedOnly: true`
  from the reader context; both that test and its implementation are unchanged
  from the starting commit. No production build was run for this development fix.
