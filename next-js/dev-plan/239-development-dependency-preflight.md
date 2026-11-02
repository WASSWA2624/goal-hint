# 239 · Development dependency preflight

- Restore the incomplete local dependency tree from the existing lockfile,
  including Prisma's already-declared `effect` dependency.
- Check the development runtime before MySQL startup or existing-server cleanup;
  report `npm ci --include=dev` when dependencies cannot load.
- Cover missing transitive dependencies, live mode, and failure ordering with
  focused regression tests and document the recovery command.
- Verify Prisma generation/validation and actual demo startup, then commit and
  push the intended changes on `main`.

## Verification

- Recovered missing npm archives with SHA-512 checks against the existing lockfile;
  the locked reinstall completed with 528 packages and successful postinstall.
- `npm ls effect @prisma/config prisma --depth=2` resolves `effect@3.20.0` under
  `@prisma/config@7.10.0`; Prisma configuration loads and schema validation passes.
- All 60 development launcher tests pass, including six dependency regression
  checks and the real port-listener recovery check.
- `npm run dev -- --port 3107` passes migrations, prepares 6,680 demo fixtures
  across 334 days, and starts Next.js 16.4.2 successfully.
- The homepage returns HTTP 200 with Goal Hint content after its cold compilation.
