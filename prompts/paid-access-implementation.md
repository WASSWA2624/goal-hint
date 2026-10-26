Implement Goal Hint paid access: phone sign-in, subscriptions and the `/admin` owner dashboard.

Work in the existing Next.js application under `next-js/`; run its commands from that directory. Paths below are relative to the repository root. Shared specifications and prompts remain at the root, and the planned `flutter/` wrapper is outside this task.

First read `app-write-up.md` (v1.9), `prompts/dev-plan/000-index.md`, `prompts/monetization.md` and `next-js/dev-tracker.md`. Owner inputs already given are recorded in OP-38 in `next-js/docs/implementation-decisions.md`; don't ask for them again.

Run `prompts/dev-plan/057` to `067` in numeric order, one prompt at a time. For each prompt:

1. Implement exactly its scope and run its acceptance checks.
2. Update `next-js/docs/development-progress.md` and `next-js/docs/implementation-decisions.md`. Set its `next-js/dev-tracker.md` row to ☑ Completed only when every check passes, otherwise ◐ Partial with a one-line note on what is missing.
3. Commit with a message naming the prompt, push to `origin main`, then start the next prompt.

Work without waiting for me. When a prompt needs an owner input (mobile money numbers and registered names, contact or WhatsApp numbers, SMS samples, network prefixes, legal or refund facts), ask me for it in one short message, then keep going: use obviously fake values in tests and local dev only, never in committed settings or public copy, and leave the row Partial until the input arrives.

Stop and wait for my answer only when:

- a major decision would change the approved design, prices or security model;
- a check fails and cannot be fixed within the prompt's scope;
- an action needs my approval: any deployment, production settings, spending money, deleting data, or adding env keys or npm dependencies.

Put your recommendation in the question.

Never deploy, and keep paid access switched off. When 067 is done, send me one list of every input still needed to switch paid access on.
