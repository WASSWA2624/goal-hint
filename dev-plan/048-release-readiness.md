# 048 Release readiness gate

**Feature:** An executable, evidence-based production release decision.

**Depends on:** [039-privacy-page.md](039-privacy-page.md), [040-terms-page.md](040-terms-page.md), [041-contact-page.md](041-contact-page.md), [042-seo-discovery.md](042-seo-discovery.md), [045-backup-restore.md](045-backup-restore.md), [047-shadow-qualification.md](047-shadow-qualification.md).

**Source:** [App specification](../app-write-up.md), sections 1–15, especially section 15 acceptance criteria and launch decisions.

## Prompt

Read `dev-plan/000-index.md`, the specification and accumulated implementation/evaluation evidence. Implement a release-readiness command and report that map every section 15 requirement to a reproducible check or dated manual evidence. Reuse meaningful existing checks instead of duplicating implementation tests. Distinguish pass, fail, pending and not applicable with justification. This feature evaluates readiness; do not turn it into a catch-all implementation step. Report missing features or regressions against their owning prompts.

Cover free fresh-session access and rejected private mutations; 320/360/390/430 px, keyboard/zoom/broken-logo layouts; SSR/style hydration; canonical teams and direct URL-only third-party images; EAT boundaries; concurrency, partial revisions, cutoff/early-start handling; source integrity; settlement/correction counts; outage recovery and immutable degraded manifests. Exercise stale clients and account-wide 12/second, 720/minute and 120,000/provider-day limits, including reserves/retries/reset/expiry, without expensive uncontrolled load.

Require evidence for shared 15-second live and 60-second date/result polling, the final-badge latency target, and no visitor-triggered AI. Check SEO/noindex/404s, English string expansion, production build and security boundaries. Include measured mobile performance targets, qualification results for 100/500/1,000/full-slate workloads, budget cap enforcement and honest field-data limitations.

Gate release on actual API-Football payable cost within US$45, active account/rights/freshness/reset validation, separate approved budgets, completed prospective quality gates, backups/restoration, monitoring/incident ownership and factual methodology/privacy/terms/contact content. Verify domain/HTTPS/DNS configuration readiness without purchasing anything. Missing credentials, legal facts, samples or owner decisions are blockers, not inferred approvals or successful checks.

## Acceptance checks

- Run the gate against current code and produce a dated report tied to commit/build/configuration evidence.
- Prove a failed required check and a missing evidence item prevent a ready status.
- Ensure each specification acceptance row has traceable evidence or an explicit blocker.
- Keep laboratory, replay, staging and production measurements clearly distinguished.

## Handoff

Required: when this feature's implementation and acceptance checks are complete, update [dev-tracker.md](../dev-tracker.md) by ticking this file's row (☐ → ☑). Leave the checkbox empty while work or required checks remain incomplete.

Update `docs/development-progress.md` with changed files, readiness results, evidence paths and blockers. Record release decisions in `docs/implementation-decisions.md`; do not claim readiness with unresolved required gates.
