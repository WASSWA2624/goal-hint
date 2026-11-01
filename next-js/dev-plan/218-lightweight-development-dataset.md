# 218 · Lightweight development dataset

## Goal

Reduce the isolated local development demo to at most 20 fixtures per Africa/Kampala
day from 1 January through 30 November 2026, with varied UI examples.

## Implementation

- Curate 20 distinct competitions daily from the existing 56 groups, rotating
  countries and pairings while preserving retained fixture IDs and match facts.
- Use this selection on bootstrap, date materialization and unfiltered synthetic
  fixture lists so restarting development cannot restore the 560-match cohort.
- Keep complete in-memory provider history for consistent team form, standings,
  head-to-head and player aggregates, without expanding the stored schedule.
- Acquire exclusive ownership of the demo's verified loopback MySQL/datadir.
  Preserve the separate configured application database and account/settings data.
- Before cleanup, stream an encrypted consistent full backup and verify its
  authenticated decryption and complete plaintext SHA-256. Keep it and its
  separate key in ignored, private development storage.
- Remove excess fixtures and the full relational dependency closure in bounded
  batches. Regenerate affected sealed editorial examples from the retained cohort;
  discard saved/shared snapshots whose selections no longer exist. Restore all
  local delete guards, verify every FK and compact affected tables to reclaim space.

## Verification

- Retained exactly 6,680 canonical fixtures: 334 Africa/Kampala dates, each with
  20 fixtures and 20 distinct competitions; all 56 competition groups remain.
  Removed 180,360 fixtures and their dependent records.
- Engine-reported table/index allocation fell from 9,099.9 MiB to 422.7 MiB after
  compaction and normal demo preparation (about 95.4%). All 118 original tables
  remain; maintenance planning/copy tables were removed.
- The 609 MiB encrypted full backup passed complete authenticated decryption and
  plaintext SHA-256 comparison. Its separate key remains in private ignored
  storage. A complete SQL restore drill was not performed.
- All 146 original foreign keys pass orphan checks. Nineteen protected account,
  payment/configuration tables matched their pre-cleanup content hashes before
  ordinary demo preparation. All five temporarily removed delete guards and
  other rebuilt-table triggers were restored.
- Large remaining archives were rebuilt from retained rows with content hashes.
  Verification caught a default-generated creation timestamp omitted by that
  copy; the exact pre-rebuild value was restored and corroborated by the 334
  immutable initial import receipts covering all 187,040 original fixtures.
  Complete retained fixture-row hashes then matched, including createdAt.
- All 87 demo tests, TypeScript and scoped ESLint passed. The real MySQL
  persistence integration passed for feeds, details, lineups, prices, settlement,
  performance, tomorrow's custom slips, editorial history and saved examples.
  Authenticated saving was not exercised because the existing demo session had
  been signed out; that choice was preserved.
- Normal bootstrap reused the smaller schedule and rebuilt its rich default
  window without restoring the removed cohort. Sparse stored form/H2H histories
  remain honest; complete in-memory provider aggregates stay available.
- No configured application database, production migration or provider policy
  was changed. Unrelated payment/schema work in the shared checkout was excluded.
