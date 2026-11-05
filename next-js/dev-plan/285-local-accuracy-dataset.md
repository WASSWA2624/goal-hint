# 285 — Verified local accuracy dataset

Approved 5 November 2026. Baseline `66211d772438ebe184cb0f7344239a2cf7cdb5da`;
isolated branch `codex/local-accuracy-evaluation`. The owner permits free public
archive downloads, local evaluation only, shadow mode and no paid services.

## Protocol fixed before scoring

- Audit existing local football records read-only; exclude synthetic demos and
  unsupported historical availability claims. Preserve private operational data.
- Primary pilot: Zenodo record 7831873, version 1, published April 2023. Pin its
  repository metadata and exact CSV checksum. Completed results become available
  at the repository's last modification clock, conservatively rounded upward;
  never invent match-end receipt times.
- Select every originally scheduled, unfinished 2022/23 LaLiga fixture whose
  explicit archived kickoff is more than 24 hours after archive availability.
  This fixes 41 targets before structured result acquisition/scoring. Preserve unavailable or
  rescheduled targets in the denominator. No outcome-driven exclusions.
- Interpret archive wall times as mainland-Spain time, then require exact UTC
  corroboration and exact team identity from the later label source. The archive
  does not identify its original collector or timezone; disclose that limitation.
- Freeze the current Poisson model/configuration and 24-hour forecast horizon.
  Do not tune on this pilot. Use the same already-published history for each
  target; later verified results have today's capture time and are label-only.
- Compare raw local forecasts with the existing league-frequency baseline on
  identical settled fixtures. Report market-specific scores, coverage, sample
  counts, calibration bins and operational shadow eligibility separately.
- Keep provider/AI/ensemble, priced ROI and whole-slip comparisons unavailable
  where their original authenticated evidence is absent. This small retrospective
  fixed-vintage pilot cannot qualify prospective publication or public claims.

## Implementation and verification

Keep raw downloads, local extracts, verifier and generated result bundles in
ignored private `.tmp/local-accuracy-285/`. Commit reusable preparation/verification
code, focused integrity tests and aggregate execution evidence only. The verifier
must rebuild from pinned original source bytes and exact row mappings; a dataset
hash alone or an unconditional verifier is insufficient.

Run the existing offline intelligence report command and a matched-cohort summary.
Test tampered archives, wrong identity/time, unavailable labels and source/result
separation. Record actual metrics, limitations and reproducible commands in the
final report. No application migration, live job registration, public prediction
change or service activation is part of this task.

## Coordination and rollback

Pay/Details own current checkout/Flutter changes and plan 286. A separate UI
performance chat owns navigation/performance work. This task touches none of
those paths; overview edits are limited to prediction/evaluation paragraphs.
Integrate verified commits sequentially and preserve active branches, worktrees,
screenshots and existing stashes.

Rollback is source reversion with the engine still disabled. Preserve original
data receipts, the frozen protocol and first evaluation results for audit.
