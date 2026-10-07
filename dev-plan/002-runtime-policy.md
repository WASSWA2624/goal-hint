# 002 Runtime policy

**Feature:** Provide validated configuration and a traceable implementation decision register.

**Depends on:** [001 Project foundation](001-project-foundation.md).

**Source:** [App specification](../app-write-up.md), sections 1, 5–8, 11 and 14–15.

## Prompt

Read `dev-plan/000-index.md`, the source sections and existing code. Implement one typed, server-owned runtime-policy contract that later features can reuse. Separate public nonsecret settings from server secrets and distinguish required production configuration from optional capabilities. Validate configuration at the relevant process boundary, with clear redacted errors. Supply a documented example environment file without real credentials.

Encode settled product rules: Goal Hint, `https://goalhint.com`, free public access, English/light launch, EAT reporting, daily seven-day refreshes, five-minute cutoff, four regulation-time markets, API-Football direct Mega and its US$45 monthly payable ceiling. Keep ads disabled; additional locales, dark mode and exact scores must not silently become launch features. Make operational limits explicit and reusable rather than scattered literals.

Create or extend `docs/implementation-decisions.md`. For each unresolved choice record status, decision/evidence, owner when known, affected configuration and first dependent prompt. Cover competitions; separate AI, research and infrastructure budgets; AI/calibration and licensed research providers; evidence thresholds; source/status freshness; unknown timestamps; numeric/consistency tolerances; evaluation sample sizes and release gates; worker/queue hosting; alert/recovery ownership; correction horizons; retention, analytics, rights and contact/legal content. Identify whether optional exact scores are intentionally excluded or approved with their validation requirements.

Resolve choices from existing authoritative project/operator evidence when available. Request a missing decision only at its first necessary dependency, after completing useful independent work. Do not invent budgets, provider credentials, rights, thresholds or policy signoff. Represent unresolved values explicitly: affected live operations fail closed with an actionable reason, while isolated local contracts and tests remain usable. Do not interpret missing data as an enabled capability or a zero-cost allowance.

Distinguish private shadow eligibility from production qualification. A bounded private shadow run may gather missing quality evidence after provider rights, budget and pipeline-integrity prerequisites pass; this cannot publish production forecasts or claim qualification.

## Acceptance checks

- Invalid, missing-required and contradictory configuration fail with useful messages that reveal no secrets.
- Production cannot start an affected paid/provider operation with unresolved mandatory policy; test configuration remains explicitly separate.
- Public configuration exports contain no service credentials or private operational settings.
- Settled specification rules and every launch decision have one discoverable definition or register entry.

## Handoff

Record changed files and meaningful validation results in `docs/development-progress.md`. Link the decision register and enumerate only actual unresolved dependencies, including their first affected prompts. Never record a proposed external choice as confirmed.
