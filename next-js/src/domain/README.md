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

The [client-state contract](../../docs/client-state.md) defines validated feed
URL queries and visitor-facing versioned fixture snapshots. Pages, future public
APIs and browser reconciliation must share these contracts rather than expose
provider payloads or duplicate calendar/market validation.

The [match-card contract](../../docs/match-card.md) extends that projection with
optional approved logo URLs, coverage notices and revision-bound outcomes.
`match-card.ts` presents the selected family through existing market rounding
without inferring settlement from scores. `remote-image.ts` shares structural
HTTPS checks with server approval paths; it does not grant media rights.
