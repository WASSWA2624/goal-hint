# Client state

Construct a store with `makeStore(initial)` inside each `FeedStateProvider`.
Never export a store instance or access Redux from a Server Component. Use the
typed hooks and explicit handoff/request actions described in
[the state contract](../../docs/client-state.md).

URL parameters own applied filters. Redux owns drafts, view preferences and
transient accepted fixture/list state. Only the allowlisted anonymous density
preference uses local storage. `refreshApi` and `detailApi` expose implemented anonymous
stored-data GETs for their respective routes. No provider clients,
server imports or worker/job endpoints belong in this layer. Lifecycle timers
live in the shared refresh hook. See [live refresh](../../docs/live-client-refresh.md).

Match details use `DetailStateProvider` and `makeDetailStore()` for a separate
request cache without feed drafts, snapshot reducers or preference storage.
Both routes inject their endpoints into `refresh-base.ts`; detail validators load
alongside the first API read, while the initial server projection renders directly.
