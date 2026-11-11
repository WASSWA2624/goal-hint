# 303 Forecast selection and Today loading

Keep today's stored fixtures visible while real forecasts are being published. Reuse completed date imports and finish large forecast selections within the existing transaction and lease limits.

- Batch initial cycle, audit and run membership writes while preserving reschedule fences and publication cutoffs.
- Read active-run progress in a bounded query. Keep explicit prediction filters and use the same cohort for the list and its performance summary.
- Keep confirmed matches and counts visible during refresh. End foreground progress on success, failure or cancellation. Let periodic refresh stay quiet.
- Verify today's stored fixtures, genuine pre-cutoff forecasts and actual performance through the local application. Measure the default Matches, Performance, Builder and match detail routes with the worker running.

## Local verification on November 11, 2026

- An isolated MySQL run selected 2,000 of 2,050 fixtures in 15.2 seconds. It reused the completed date import and verified the cycle schedules, sealed audits and idempotent commit.
- The development run had eight completed imports with one attempt per date. The signed-in admin handler checks used a rolled-back session and confirmed 192 fixtures, 34 pre-cutoff publications, zero qualifying picks and zero settled forecast results for today. The Matches document rendered the 192-fixture total and performance counts.
- Warm local navigation responses for Matches, Performance, Slips and Builder started in 0.17–0.53 seconds. Matches finished in 1.51 seconds, Slips and Builder in under 0.7 seconds, and the default 30-day Performance report in 7.29 seconds. A one-day Performance document loaded in 1.24 seconds. These are HTTP timings. The browser tool could not verify the signed-in Chrome tab URL, so visual and click timing checks remain pending.
