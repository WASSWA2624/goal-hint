# Baseline regression repairs

## Scope

- Preserve existing application UI content, styles, workflows, access rules and runtime behavior.
- Align stale regression expectations with current admin navigation, 30-day reset defaults, odds bands, normalized standings, client-address provenance, gated payloads and access links. Keep privacy assertions explicit and test every supported result/band combination.
- Test legacy homepage redirect ordering and its streamed shell behavior directly, replacing a source-layout-dependent assertion.
- Give slip decision fixtures explicit probability/odds bounds rather than relying on changing form defaults; retain coverage of full outcome distributions and the independent immutable featured recommendation.
- Share the private-response coverage contract across HTTP/discovery tests. Bound the main Node suite to three workers so its 299 files, child compilers and build fixtures do not exhaust resources or produce timing failures.
- Repair the anonymous deployment verifier's markup/probability checks and align its fixtures with protected insights and empty probability arrays. Completed public cards remain permitted.
- Repair shared-slip trigger bodies with a forward migration and matching MariaDB overlay. Preserve applied migration checksums and existing immutable-row guards. No existing application or production database was migrated.

## Verification

- `npm test`: 2,792 checks, 2,791 passed, zero failures and one Windows skip for the POSIX-only file-mode assertion. The main suite covers all 299 Node test files, including real negative Next.js build fixtures.
- `npm run test:scripts`: all 165 Python checks passed.
- Database client generation, schema validation, shared theme contract, ESLint and TypeScript passed.
- `npm run build`: optimized Turbopack production build and offline manifest generation passed in a detached verification checkout. Only that checkout's Turbopack filesystem root was widened to resolve its shared dependency junction; the running development server was preserved.
- Native backup acceptance on owned isolated MySQL 26.10.0: six checks passed, one integration check failed with `BackupError: source-mismatch` during the source-identity/quiescence check, before snapshot capture. Fresh migration deployment completed, but native backup/restore remains unverified. Investigation stopped at the user's explicit request; no successful restore is claimed.
- Application screen, component, styling and runtime business-logic files were not changed. Existing stashes and detached worktrees were preserved.
