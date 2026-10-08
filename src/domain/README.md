# Shared domain

Place environment-independent types, schemas and pure business rules here as
their owning prompts require them. This is the common contract for web, server
and worker code. Do not import React, Next.js, server services, workers, browser
APIs, Node built-ins or read environment variables here. Provider payloads and
database clients belong in the server layer. No speculative market types are
introduced by the foundation.

The shared [calendar contract](../../docs/calendar.md) owns reporting dates,
prediction/query boundaries, temporal publication rules and kickoff display
inputs. Components and adapters should use it instead of duplicating arithmetic.

The [market contract](../../docs/markets.md) owns versioned regulation-time
probabilities, source-group consistency, deterministic picks, presentation and
pure result adjudication. Reuse it in providers, publications, UI and settlement.
