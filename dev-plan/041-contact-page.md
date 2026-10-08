# 041 Contact and corrections page

**Feature:** Public contact information and a usable correction-reporting route.

**Depends on:** [038-methodology-performance.md](038-methodology-performance.md), [039-privacy-page.md](039-privacy-page.md), [040-terms-page.md](040-terms-page.md).

**Source:** [App specification](../app-write-up.md), sections 2, 8, 12, 13 and 15.

## Prompt

Read `dev-plan/000-index.md`, the source sections and the existing operator/correction decisions. Implement the English contact page in the shared shell and link it from the footer and relevant policy pages. Present the actual owner-supplied public contact route and operator information approved for publication. Use a verified email link or an already established contact destination; do not create a new form backend, mailbox or messaging service as part of this feature.

Explain how visitors can report fixture identity problems, source mistakes and result/correction concerns. Request only useful non-sensitive information such as the match URL, the observed issue and a supporting source. Explain that verified result corrections preserve the locked forecast and are audited rather than replacing the pick with a more favorable revision. Align response/process statements with real ownership and capacity; do not promise an unsupported response time.

If a lawful public contact route or incident/correction owner is missing, finish the reusable page structure and record an explicit launch blocker in the decision log. Never invent an address, phone number, email inbox or person's identity. Keep placeholder/TODO content out of a production publication. A contact link is sufficient; this task does not authorize sending a test email, contacting third parties, or subscribing the owner to services.

Keep the page short, accessible and consistent with the brand. Externalize strings, validate link schemes and prevent untrusted query text from entering mail headers or markup. Include meaningful metadata and ordinary links to privacy, terms and methodology. Do not add visitor accounts, uploads or a public comments system.

## Acceptance checks

- Verify the public contact destination matches owner-supplied evidence and links resolve structurally without sending messages.
- Check correction instructions against the actual settlement/audit policy.
- Confirm footer access, keyboard operation, responsive layout and safe link encoding.
- Ensure missing required contact details are tracked as a release blocker and never replaced by fictitious values.

## Handoff

Required: when this feature's implementation and acceptance checks are complete, update [dev-tracker.md](../dev-tracker.md) by ticking this file's row (☐ → ☑). Leave the checkbox empty while work or required checks remain incomplete.

Update `docs/development-progress.md` with changed files, checks/results and blockers. Record approved contact/correction ownership in `docs/implementation-decisions.md`.
