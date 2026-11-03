# Local database update and slip alignment

The owner requested all pending migrations and database verification, followed by full-width share-image sections and a common horizontal centre for team logos, names and VS/scores.

## Database result — 3 November 2026

- Verified the configured local MySQL 8.4.11 instance, its existing server identity, loopback port 3307 and normal recovery mode before changes.
- Preserved an access-restricted AES-256-GCM logical checkpoint with a separately stored key. Authenticated decryption and an isolated restore matched all 117 prior base-table counts and 57 completed migrations. Two existing SharedSlip trigger definitions required delimiter normalization in the restore stream; the original encrypted backup and live definitions were preserved.
- Applied `20261101120000_payment_checkout`, `20261103120000_transient_slips_and_odds_bands` and `20261103160000_readable_slip_and_referral_codes` through the separate migration role. The removed personal-slip tables were empty; existing shared snapshots remain supported.
- Granted SELECT/INSERT/UPDATE on the three checkout receipt/evidence tables and SELECT/INSERT on ReferralCredit, PaymentEvent and SlipNumber. The private grants record retains its checkpoint and added statements. Application DDL and deletion of the new history/receipt tables remain denied.
- Converted one existing member's referral code to eight digits with its legacy alias preserved. Both identifiers resolve to the same existing account, and a second provisioning preview reports zero remaining conversions.
- Final status: 60 completed migrations, zero pending/unfinished, 121 base tables and all 120 application models readable. `db:status`, `db:verify` and `db:health` pass; health is `ready` and now includes SlipNumber.
- Rollback-only application-role checks verified stable numeric allocation, referral conversion/alias retention and least-privilege reads/mutations. Synthetic rows retained: zero. Existing member, session and payment counts remain unchanged. Sequence gaps from rolled-back allocation are expected.
- Removed the temporary same-user native administration task and preserved the normal MySQL startup task. This operation updates the configured local target; hosted production was not changed.

## Image result and validation

- Summary, match sections and separators span the branded-header width with consistent 80px text gutters. Predictions retain plain backgrounds.
- Logos and measured team-name glyphs share a horizontal centre with VS or an observed score. Multiline names centre as a block; score width reserves space between both teams. Scores remain separate presentation data and do not settle predictions.
- Public/legacy responses retain bounded observed scores; existing links and fingerprints stay unchanged. The opt-in `/scores` acceptance fixture uses synthetic results and real public badge assets.
- Targeted sharing/schema/health tests: 20 passed. Real isolated MySQL checkout, migration-compatibility and readable-code checks: 19 passed. TypeScript, scoped ESLint, theme contract, production build and sharing HTML acceptance checks passed.
- Inspected exported PNGs and phone/desktop drawers in both themes, including VS, scores and settled colours. Native device handoffs and the broader-suite limitations recorded in plan 255 remain separate checks.
