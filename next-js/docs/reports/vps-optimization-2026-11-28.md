# Hypernova VPS performance and resource audit

## Hosted baseline

The 28 November 2026 audit verified MariaDB 11.4.14 on the 12-vCPU Hypernova VPS, with 24,030 MiB RAM and a 492 GiB filesystem at 47% used. A seven-second sample had 55–62% CPU idle, 0–2% I/O wait, and no reported steal. Around 11–12 GiB of memory was available, no swap was configured, and memory pressure was zero over the sampled intervals. The network snapshot showed six cumulative receive drops and zero errors on the primary interface. These samples describe short periods on the VPS. [Earlier resource audit](performance-reliability-2026-11-28.md#production-resource-contention)

The passive collector also ran on the VPS. In its five-second sample, the disk reported about 17 MiB/s of reads and 45 MiB/s of writes, with 20% busy time. The primary interface carried about 42 KiB/s in and 101 KiB/s out, and memory stall time remained zero. Its two production log windows met both coverage checks. The latest staging window ended after its last observed request and was marked as incomplete.

MariaDB was running with a 4 GiB InnoDB buffer, `O_DIRECT`, a 151-connection limit and a recorded peak of 38 connections. Two samples 15.05 seconds apart recorded approximately 997 physical buffer reads and 675 statements per second, and 50 additional aggregate InnoDB row-lock waits. The second sample had zero current waits and zero connection-limit errors. Performance Schema and the slow-query log were disabled. A single verified TLS loopback client ran 30 readiness reads with p50/p95/p99 of 0.49/0.72/0.77 ms after a 34.27 ms process startup and first round trip. This probe measures an established connection doing `SELECT 1`. The shared instance counters cannot attribute queries or waits to an individual service. [MariaDB status counters](https://mariadb.com/docs/server/reference/sql-statements/administrative-sql-statements/show/show-status)

Passive HTTPS logs contained intermittent production 503s across three recent five-minute windows. The observed counts were 7 of 198 date-scoped Matches API reads, 2 of 179 summary reads, 9 of 131 Best Slips API reads, and 3 of 11 login attempts. Guest session traffic logged 276 HTTP 200 responses. A separate full default Matches API request returned 200 in 26.85 seconds, with headers at 25.92 seconds. The corresponding staging request finished in 1.05 seconds on its sparse dataset. These are single wide-route observations.

The account crontab scheduled football every five minutes and Best Slips at :00 and :30. A read-only queue snapshot found 43 due forecast jobs, the oldest currently eligible for 15 seconds, and no expired lease among the two running jobs. The previous hour had 270 successful forecast jobs, 34 failed and one expired. The 270 successful attempts averaged 0.78 seconds in the handler and the maximum was 5.96 seconds. A separate snapshot categorized the 34 failures as non-retryable and showed retries for handler failures and rate limits. The last sampled football heartbeat had both pollers attached, and the latest sampled publisher status was published. First claim minus creation can count time before a scheduled job becomes eligible. Use availability time for pending age and attempt start for completion duration. [Durable queue](../durable-jobs.md)

### Privileged host inspection

Root SSH confirmed Ubuntu 24.04.5, kernel 6.8 and cgroup v2. The active service inventory covered the Apache and Passenger web processes, MariaDB, cron and both job launchers, cPanel application and mail services, logging, monitoring and provider agents. cPanel reported Apache and MariaDB running and monitored. Apache configuration passed its syntax check. The failed cPanel Greylisting unit was the only failed systemd unit in the snapshot. Munin, NRPE, atop and sysstat were active. The sampled kernel and MariaDB journals had no matching memory/I/O or MariaDB error lines in the preceding three hours.

Passenger reported a six-process global pool with three production processes and one staging process. The top-level and both app queues were empty. One production process was serving 12 concurrent sessions and using about one core. The effective web pool limits were five connections per production process and two per staging process, with eight for the football worker. The publisher has a separate launcher. MariaDB reported about 181 GiB of allocated production InnoDB data and indexes. One transaction snapshot had seven production transactions, one waiting on a lock, with the oldest three seconds old.

The sampled web, database and cron cgroups used default CPU and I/O scheduling and had no configured memory ceiling. The live football process belonged to the cron cgroup, which also hosts other scheduled work. The recent sysstat intervals showed 48–79% CPU idle and roughly 1–2% I/O wait during the audit and its lead-up. This and the open Passenger queue capacity favor reducing time each request holds its connection. Changing shared quotas, CPU weights, buffer size, or worker concurrency requires a workload showing benefit and isolated staging for the affected service.

## Application change and verification

Matches now closes its repeatable-read transaction after constructing its stored pages. Schema validation, the serialized byte-size limit and freezing run after the connection returns to the pool. The request timing labels expose transaction and response work independently. Pagination, access rules, snapshot identity and the API response contract use the existing code paths. The migration inventory is unchanged. [Matches API](../match-feed-api.md)

An alternating synthetic comparison on pinned Node 24.18.1 used 200 measurements per version after warmup and asserted equal pages. Transaction callback times in milliseconds were:

| Workload | Before p50 / p95 / p99 | Candidate p50 / p95 / p99 |
| --- | --- | --- |
| 100-row page | 3.69 / 8.57 / 12.02 | 1.98 / 4.37 / 6.68 |
| Two-page window with 105 rows | 3.28 / 5.81 / 10.51 | 1.58 / 2.65 / 6.91 |

Whole-call p95 was 9.04 to 10.84 ms for the page and 6.37 to 5.99 ms for the window. The fixture isolates time spent inside the transaction callback. These results do not establish a production latency gain.

### Staging comparisons

Staging served commit `1e5f6aad`, Next build `dHA7cgxq9trQxVg_25ebR`, with `noindex` and all 95 migrations verified. Its HTTPS and Chrome gate confirmed Matches, Best Slips and history, with zero uncaught browser errors. Staging reported its expected limited coverage. The default-width Matches API completed in 1.05 seconds before and 1.01 seconds after in single reads.

| Matched HTTP workload | Successful before / after | Completion p50 / p95 / p99 before, in ms | Completion p50 / p95 / p99 after, in ms | Requests/s before / after |
| --- | --- | --- | --- | --- |
| 48 total across Today Matches list, summary, Best Slips and guest session | 48 / 48 | 328 / 351 / 377 | 330 / 359 / 368 | 1.318 / 1.318 |
| 100 Today Matches list reads | 100 / 100 | 332 / 455 / 590 | 326 / 344 / 414 | 1.918 / 1.942 |

The before and after reports matched each workload fingerprint and used one in-flight request. Samples exclude warmup. Hosted staging shares resources with live traffic and has sparse data. The measured throughput is limited by the deliberate pacing. The smallest workload had 12 requests per route, so its per-route p95 and p99 were the observed maximum. [Benchmark and passive observation](../operations-monitoring.md#vps-performance-measurements)

### Production trial

The first production trial passed the candidate's HTTPS and schema gates. Chrome reached 50 Matches rows and coherent counts, then timed out waiting for the Best Slips list after in-app navigation. The deployment switched back to build `CBcQHNHdrKOXDap9GN4rB`. The receiver's rollback smoke saw an unavailable Matches summary shell and retained the recovery journal. A separate Chrome verification on the restored build passed Matches, Best Slips in-app and direct navigation, and history with no page errors. The retry uses the receiver's normal recovery path and the same staging archive.

## Resource changes and recovery

Existing resource settings provide the starting point. Capture the service tree, Apache vhost and pool settings, database memory and queue overlap with privileged access before testing a change. Use isolated equivalent Linux staging for server-wide experiments. Under demonstrated contention, compare worker CPU or I/O weight against current defaults, tracking both interactive errors and cutoff or publication completion. Review query plans on a representative dataset before changing indexes. Use a low-volume production check and matched passive traffic after promotion. [systemd resource controls](https://www.freedesktop.org/software/systemd/man/latest/systemd.resource-control.html)

The web receiver checks the candidate before recording the active release and rolls back a failed cutover. To restore after a verified release, package the earlier compatible Git commit and use the staging-first `--restore` procedure, checking the migration ledger and HTTPS in each environment. For any future host settings experiment, save the effective and source settings before changing them, then restore only that experiment's drop-ins and recheck both environments and job deadlines. [Hosted promotion and restore](../deployment/how-to-deploy.md#vps-staging-and-release-promotion)
