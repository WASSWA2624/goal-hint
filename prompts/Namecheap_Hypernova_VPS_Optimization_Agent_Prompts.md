# Namecheap Hypernova VPS — Resource Management & Performance Optimization

## Context

- **Server:** Namecheap Hypernova VPS, Ubuntu 24.x, administered via root SSH, WHM and cPanel
- **Resources:** 12 vCPU cores, 24 GB RAM, 500 GB SSD, 10 TB/month bandwidth
- **Workloads:** Next.js application, databases, API integrations, scheduled jobs, background workers and payment-related services
- **Goal:** Fast, dependable user-facing responses while background workloads run efficiently and finish within their required schedules.

**Run the following prompts in order. Do not skip the audit.**

## Prompt 1 — Audit the Existing Server (Read-only)

> Act as a senior Linux/WHM-cPanel administrator and performance engineer. With the available root SSH, WHM and cPanel access, audit this VPS and its application environment. Identify all running applications, web servers, process managers (including any Passenger, PM2 or cPanel-managed runtime), databases, Redis instances, background workers, queues, cron jobs, scheduled services and payment-related processes. Measure CPU/RAM use, disk I/O, network activity, database query latency, API response times, worker throughput and queue delays. Identify resource contention, bottlenecks, duplicate services, idle capacity and potentially conflicting process managers. Capture baseline p50/p95/p99 latency and workload benchmarks where practical. Produce a prioritized, evidence-based optimization plan with proposed changes, risks, compatibility considerations and a rollback approach. **This phase is strictly read-only: do not install, stop, restart, reconfigure or remove anything.**

## Prompt 2 — Implement Resource Management & Safe Autoscaling

> Using the completed audit, implement measured resource management on **staging first**. Prioritize interactive Next.js pages, API requests and database operations over CPU-heavy predictions and other background jobs. Tune the existing runtime/process manager and use systemd CPU/memory controls, database connection pooling, caching, query/index optimization, concurrency limits and queue backpressure where justified. Assess PM2, Redis and BullMQ **only if they are compatible with and improve the existing architecture**; do not introduce a competing process manager or duplicate infrastructure. Where workloads are divisible, distribute jobs across bounded worker processes and add safe autoscaling driven by queue depth, CPU, memory and response latency. Never assume that one busy process can be split automatically. Reserve capacity for traffic spikes; avoid arbitrary fixed allocations, CPU oversubscription and memory exhaustion. Preserve application UI, business logic, prediction algorithms, payment behavior, databases and data. Make changes incrementally with verification and an executable rollback plan; apply to production only after staging tests pass.

## Prompt 3 — Monitor, Validate & Maintain

> Implement lightweight, continuous observability, alerts and recovery controls for application health, CPU, memory, disk, network, database latency, API p50/p95/p99 latency, worker failures, queue depth, queue age and job deadlines. Consider Netdata or existing monitoring tools; avoid redundant or expensive components. Configure safe restart policies, readiness/health checks, sensible timeouts, graceful shutdown and overload protection. Run realistic concurrent-load benchmarks and compare against the audit baseline. Adjust concurrency and resource limits based on actual measurements, not guesswork. Validate all critical user flows, including authentication, predictions and payment-related operations, before rolling out approved changes to production. Deliver a concise report covering changes made, process ownership, resource controls, scaling thresholds, measured results, monitoring access, alerts, residual bottlenecks and exact rollback steps.

## Non-negotiable Rules

1. **Audit first.** Verify how WHM/cPanel currently manages application processes; do not assume PM2 is required.
2. **Protect production.** Test in staging and verify functionality before deploying. Do not perform destructive changes or change production configuration without a documented rollback path.
3. **Protect data and secrets.** Never expose credentials, delete data, or create unnecessary on-server archives/backups. Follow the project's existing off-server recovery policy.
4. **Optimize user experience, not utilization.** Keeping CPU at 100% is not the target; maintain headroom for demand spikes.
5. **Show evidence.** Report before/after measurements and explain every new service, configuration and resource limit.

**Acceptance criteria:** Responsive application under expected concurrent load; smooth database/API calls; workers completing within their schedules without starving interactive requests; automatic recovery from common failures; visible performance metrics and actionable alerts.
