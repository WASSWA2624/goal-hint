# Branded slip sharing and readable codes

- Keep Download image and Share as the two drawer actions; share prepared images through the platform sheet.
- Render the existing brand, numbered teams, leagues, predictions, odds, selection probabilities and observed outcomes with bounded pagination.
- Allocate stable eight-digit slip references using a minimal fingerprint registry; retain no new personal selections.
- Issue eight-digit referral codes and retain legacy aliases, signed attribution and existing shared links.
- Update the minimal Flutter bridge for published links and image-only slips.
- Verify domain/service tests, migrations, both UI themes, browser handoffs, type checks, lint, build and Flutter checks; integrate and push main.

## Verification

- Focused sharing/code tests: 26 passed, covering image pagination through 800 selections, full international names, PNG/ZIP bytes, native activation/cancellation, stable references, entitlement and legacy links/cookies.
- Real isolated MySQL 8.4: number allocation/concurrent deduplication, database capacity enforcement, forced referral-code collision retry, legacy aliases, provisioning and reward concurrency passed. [MySQL forbids CHECK on AUTO_INCREMENT](https://dev.mysql.com/doc/refman/8.4/en/create-table-check-constraints.html), so an AFTER INSERT block trigger enforces the number capacity; raw unsigned integers are normalized before formatting.
- Complete Flutter test suite: 77 passed. Dart analysis of the changed bridge/save files reports no issues. Android debug packaging was attempted twice and blocked by Java's inability to establish a loopback connection; iOS compilation and physical-device target handoffs remain unverified.
- Production build, TypeScript, scoped ESLint, Prisma validation and the new migration static check passed. Production build reports the existing download-catalog filesystem-tracing warnings.
- Browser checks exercised PNG download, native file payload/cancellation, both themes at phone/desktop sizes, equal action heights, initials on missing badges, first-party badge loading/deduplication using synthetic badge responses, and a final opt-in preview with real public team/league CDN badges. Fixture-only offline-worker 404s are unrelated to the share flow.
- User refinement: paired team/logo columns and one facts row, a compact header, no per-selection verification line, no repeated normal-size odds total, and one wrapped footer paragraph. The final three-match branded sample is 986px high at the same 1080px width, compared with the initial 1595px export. The user subsequently restored average probability, added league badges, a stronger brand header, league-header backgrounds and semantic status backgrounds; unresolved results and confirmed upcoming matches have separate labels.
- Broad repository run: 2734 passed, 27 failed, 1 skipped (2762 total). Failures span admin, demo, feed/navigation, offline and SEO assertions, plus a file-read race while removing the superseded public-share component. Authentication vocabulary and referral suites subsequently passed all 21 tests; the timing-sensitive collector suite passed all 45 tests when repeated separately. Python suite: 157 passed and 5 failed out of 162; the failures are in existing trigger-history/production-gate assertions. These are not reported as a green repository-wide check.
- Deployment requires the readable-code migration and SlipNumber SELECT/INSERT grant; updated native hosts are needed for system file saves and numeric-reference payloads. No deployed database was modified.

- Final alignment refinement: identical summary/league rails and insets, highlighted match-number tabs, matching left anchors for reference/status/match count, and 32px team badges centred on 31px team names. Prediction/odds/probability backgrounds are plain.
