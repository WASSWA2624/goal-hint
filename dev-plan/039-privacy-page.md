# 039 Privacy page

**Feature:** A privacy notice describing the application's actual data handling.

**Depends on:** [016-locale-navigation.md](016-locale-navigation.md), [017-client-state.md](017-client-state.md), [037-live-client-refresh.md](037-live-client-refresh.md).

**Source:** [App specification](../app-write-up.md), sections 1, 6, 9, 12, 13 and 15.

## Prompt

Read `dev-plan/000-index.md`, the source sections, existing implementation and recorded operating decisions. Implement a reusable-shell privacy page and footer link in the English locale. First inventory actual visitor data flows: hosting/server logs, public endpoint protection, anonymous URL/browser preferences, any enabled analytics and third-party image requests. Describe only services that really exist, including the fact that approved remote team/competition images are requested directly by the browser where applicable. Match retention statements to implemented configuration and contractual/source permissions.

State account-free access accurately. Do not add authentication, consent software, advertising, tracking or analytics merely to make the notice easier to write. Advertising remains disabled at launch. Describe enabled technologies, purposes, recipients, retention and contact/rights handling in plain language, grounded in the applicable audience and operator details supplied by the owner. Verify applicable requirements with current authoritative sources when implementation needs legal specifics, and record references and assumptions for review.

Obtain missing operator identity, jurisdiction, lawful contact details or retention/analytics decisions through the project's decision process. Prepare the complete page structure and factual content supported by the repository while recording unanswered required details as release blockers. Do not invent an address, regulatory claim, legal identity or retention period. Do not publish placeholder text, TODOs or a notice that falsely implies required decisions are complete; gate release readiness on those facts.

Use accessible headings, readable line lengths, externalized English copy, canonical page metadata and an honest effective/review date. Reuse existing tokens and square-corner components. This feature creates the notice; it does not redesign data infrastructure or enable new services.

## Acceptance checks

- Compare every service, cookie/storage and retention assertion against real configuration/code.
- Confirm footer navigation, SSR, metadata and mobile/keyboard readability.
- Verify no fabricated personal/operator details or unresolved placeholder copy can ship.
- Record any required owner/legal confirmation as an explicit release gate.

## Handoff

Required: when this feature's implementation and acceptance checks are complete, update [dev-tracker.md](../dev-tracker.md) by ticking this file's row (☐ → ☑). Leave the checkbox empty while work or required checks remain incomplete.

Update `docs/development-progress.md` with changed files, checks/results and blockers; record factual sources, owner decisions and unresolved requirements in `docs/implementation-decisions.md`.
