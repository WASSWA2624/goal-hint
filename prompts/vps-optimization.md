## Prompt: VPS Resource Allocation & Performance Optimization

Act as a senior DevOps engineer, Linux systems administrator, and performance optimization specialist.

Optimize my **Namecheap Hypernova VPS (Ubuntu 24.x)** with the following specifications:

- **CPU:** 12 vCPU cores
- **RAM:** 24 GB
- **Storage:** 500 GB SSD
- **Bandwidth:** 10 TB/month
- **Application:** Next.js web application with databases, APIs, background workers, scheduled jobs, and payment services.

### Objectives

1. **Full server audit:** Inspect all running services, CPU/RAM consumption, disk I/O, network usage, database workloads, application processes, and existing configurations.

2. **Intelligent resource allocation:** Allocate CPU, RAM, worker concurrency, and process priorities across applications, databases, API services, and background jobs. Use systemd resource controls, process isolation, and appropriate concurrency limits where beneficial. Prevent resource starvation.

3. **Maximum application responsiveness:** Optimize Next.js production runtime, API response times, caching, connection pooling, database queries, and external API fetching.

4. **Background processing:** Implement efficient queues, parallel processing, scheduling, and workload prioritization. Ensure heavy prediction calculations and scheduled tasks do not slow down user-facing requests.

5. **Database performance:** Optimize indexing, query execution, connection limits, memory allocation, and caching based on measured workloads.

6. **Reliability:** Configure health checks, automatic service recovery, sensible timeouts, graceful restarts, overload protection, and safe resource limits.

7. **Monitoring:** Implement lightweight monitoring for CPU, RAM, disk, database latency, API response times, queue delays, and application errors.

8. **Performance validation:** Benchmark before and after optimization, measuring p50/p95/p99 latency, throughput, database performance, worker completion times, and resource utilization.

### Implementation Rules

- Inspect the actual codebase and VPS configuration before making changes.
- Do not assume all 12 vCPUs should be fully occupied or assign arbitrary fixed resource percentages.
- Prioritize interactive user requests over background jobs.
- Maximize safe parallelism without causing CPU contention, memory exhaustion, or disk bottlenecks.
- Preserve all existing application functionality, data, and configurations.
- Never change the UI, business logic, payment behavior, or prediction algorithms.
- Apply and validate changes in staging before production.
- Avoid unnecessary services, expensive tools, and excessive logging.
- Document resource allocations, configuration changes, performance improvements, and rollback procedures.

**Expected outcome:** A stable, efficiently utilized VPS where applications respond quickly, database operations remain smooth, background tasks complete within their required schedules, and concurrent users experience minimal latency.