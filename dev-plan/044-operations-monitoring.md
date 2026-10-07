# 044 Operations monitoring

**Feature:** Private observability and actionable operational alerts.

**Depends on:** [006-api-quota-limiter.md](006-api-quota-limiter.md), [010-research-cost-control.md](010-research-cost-control.md), [037-live-client-refresh.md](037-live-client-refresh.md), [043-recovery-watchdog.md](043-recovery-watchdog.md).

**Source:** [App specification](../app-write-up.md), sections 5, 11, 13–15.

## Prompt

Read `dev-plan/000-index.md`, the source sections and recorded hosting, budget, privacy and incident decisions. Implement structured operational telemetry using the selected hosting tools and private operator interfaces. Keep it outside the public application. Reuse correlation identifiers for EAT run, fixture, cycle, job and model version, and redact credentials/raw sensitive evidence.

Measure run progress, job duration, failure/retention reasons, source failures, cutoff misses, missing locks, stale data, poller ownership, unresolved results and recovery outcomes. Track account-wide API dispatch/remaining capacity, essential reserve use, 429s, reset reconciliation, credential/subscription errors and expiry. Monitor the US$45 monthly API-Football payable ceiling separately from configured AI, research, database, hosting, monitoring, network and domain budgets. Report costs from actual usage/rates with uncertainty where appropriate; alerts cannot authorize overspending or automatic plan changes.

Configure owner-approved thresholds and notification destinations for actionable outages, failed/stalled runs, final-result delays, quota pressure, cost caps and approaching expiry. Use available authorized integrations without creating paid accounts or sending unapproved test messages. Document deduplication, severity, runbook links, incident ownership and a local test sink for exercising alerts.

Add privacy-minimized measurement for server latency/cache effectiveness and mobile Core Web Vitals using the chosen analytics policy. Also cover search impressions, indexed pages, click-through rate, returning visits and match-detail use through authorized search/analytics sources or clearly recorded pending integrations; never manufacture traffic data. Targets are 75th-percentile LCP ≤2.5 seconds, INP ≤200 milliseconds and CLS ≤0.1; distinguish laboratory checks from real-traffic field evidence. Do not claim production percentiles before traffic exists or enable visitor tracking without its required decisions. Reconcile the existing privacy notice and data-flow register with any enabled telemetry, recipients and retention before activation.

## Acceptance checks

- Inject representative failure/staleness/quota/cost events into a local or authorized test sink and verify useful, deduplicated alerts.
- Confirm log redaction, bounded cardinality/retention and incident ownership.
- Verify provider/app budget distinctions and alerts before exhaustion/expiry.
- Check performance measurement overhead and accurate lab-versus-field labels.

## Handoff

Update `docs/development-progress.md` with changed files, checks/results and blockers. Record thresholds, owners, destinations and telemetry/retention choices in `docs/implementation-decisions.md` and the runbook.
