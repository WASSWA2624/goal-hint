# Client state

Construct a store with `makeStore(initial)` inside each `FeedStateProvider`.
Never export a store instance or access Redux from a Server Component. Use the
typed hooks and explicit handoff/request actions described in
[the state contract](../../docs/client-state.md).

URL parameters own applied filters. Redux owns drafts, view preferences and
transient accepted fixture/list state. Only the allowlisted anonymous density
preference uses local storage. No provider clients, server imports, RTK Query
placeholder endpoints, timers or browser network calls belong in this layer.
