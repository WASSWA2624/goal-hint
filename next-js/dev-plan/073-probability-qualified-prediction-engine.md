# 073 Probability-qualified prediction engine

Implements [the approved request](../../prompts/prediction-engine-improvement.md).
Business logic stays in `next-js/`; no screens, styling, navigation or Flutter changes.

1. Freeze one versioned probability/evidence/quote policy in new refresh intents.
2. Collect point-in-time structured history and available player evidence independently of AI.
3. Retain provider distributions and derived double chance; assess historical support and availability without inventing goal probabilities.
4. Independently validate AI and baseline pools. Require probability >= 0.65, sufficient evidence and exact permitted fresh quotes; rank by exact decimal price, then unrounded probability and stable market/selection order.
5. Prefer usable AI; otherwise select the independently retained baseline. Persist explicit abstention when neither qualifies, retaining valid family forecasts.
6. Seal the recommendation and private quote provenance inside the existing immutable candidate audit. Public reads honor this decision and preserve explicit family selection and historical argmax settlement.
7. Bind optional bounded attributable research to existing accounting, network restrictions and durable preparation receipts.
8. Exercise deterministic selection, evidence, fallback, publication, replay, reads and odds integration; run lint, typecheck and build. Record real results and activation limitations.

The default is provisional engineering policy, not an accuracy claim. Public odds display, production settings, paid-service activation and deployment remain operator controlled. Historical evaluation requires an adequate chronological point-in-time dataset; synthetic fixtures do not establish accuracy or profitability.

See [the engine runbook](../docs/prediction-engine.md) and [development progress](../docs/development-progress.md) for implemented rules and verification evidence.

Implementation delivered: full unit run 2,134 passed/0 failed/1 Windows-specific
skip; 75 Python checks, lint, typecheck and build passed. The initial ten MySQL
skips were resolved in the 27 October follow-up: all ten top-level cases passed
(96 including nested cases, zero failures/skips) using fresh owned MySQL 8.4.11
instances. The zero-budget publication regression was reproduced and fixed.
Live source/account qualification and chronological evaluation remain unverified;
production was not activated or changed.
