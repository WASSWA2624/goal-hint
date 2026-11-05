import assert from "node:assert/strict";
import test from "node:test";
import { createSlipMatchObservationStore } from "../src/components/slips/slip-match-observations.ts";
import { shareUnchanged } from "../src/domain/structural-sharing.ts";

const state = (fixtureId, changes = {}) => ({ fixtureId, family: "match-result", selection: "home-win",
  forecast: { cycleId: `cycle-${fixtureId}`, revisionId: `revision-${fixtureId}`, publishedAt: 1 },
  status: "live", outcome: "pending", score: { home: 1, away: 0 }, liveClock: null, ...changes });

test("unchanged slip polls retain the context snapshot and skip redundant subscriber updates", () => {
  const store = createSlipMatchObservationStore("cohort");
  let notifications = 0;
  const unsubscribe = store.subscribe(() => notifications++);
  assert.equal(store.getSnapshot(), null, "no accepted observations initially override server seeds");
  store.publish({ states: [state("1"), state("2")], revoked: false });
  const first = store.getSnapshot();
  assert.equal(notifications, 1);
  for (let index = 0; index < 5; index++) store.publish({ states: [state("1"), state("2")], revoked: false });
  assert.equal(store.getSnapshot(), first);
  assert.equal(notifications, 1, "identical polls do not rerender every live slip consumer");
  const changed = { states: [state("1", { score: { home: 2, away: 0 } }), state("2")], revoked: false };
  store.publish(changed);
  assert.equal(notifications, 2);
  assert.deepEqual(store.getSnapshot(), changed);
  assert.notEqual(store.getSnapshot().states[0], first.states[0]);
  assert.equal(store.getSnapshot().states[0].forecast, first.states[0].forecast);
  assert.equal(store.getSnapshot().states[1], first.states[1], "untouched observations keep their identity");
  unsubscribe();
  store.publish({ states: [], revoked: true });
  assert.equal(notifications, 2);
});

test("empty responses, access revocation and a changed cohort never retain prior observations", () => {
  const first = createSlipMatchObservationStore("first"), second = createSlipMatchObservationStore("second");
  let notifications = 0;
  first.subscribe(() => notifications++);
  first.publish({ states: [], revoked: false });
  assert.deepEqual(first.getSnapshot(), { states: [], revoked: false });
  assert.equal(notifications, 1, "the first accepted empty response overrides server seeds");
  assert.equal(second.getSnapshot(), null);
  first.publish({ states: [state("1")], revoked: false });
  first.publish({ states: [], revoked: false });
  assert.deepEqual(first.getSnapshot().states, [], "accepted empty responses clear previous values");
  first.publish({ states: [], revoked: true });
  assert.equal(first.getSnapshot().revoked, true);
  assert.equal(notifications, 4, "revocation is delivered even when observations were already empty");
  second.publish({ states: [state("1")], revoked: false });
  assert.equal(first.getSnapshot().revoked, true, "another cohort cannot restore a revoked snapshot");
  assert.equal(second.getSnapshot().revoked, false);
  const changedForecast = { states: [state("1", { forecast: { cycleId: "new-cycle", revisionId: "new-revision", publishedAt: 2 } })], revoked: false };
  second.publish(changedForecast);
  assert.deepEqual(second.getSnapshot(), changedForecast, "forecast identity remains part of the accepted data");
});

test("slip browse snapshots retain untouched cards while exact changed results and access projections win", () => {
  const slip = (id) => ({ id, rank: Number(id), totalOdds: "4.00", averageProbability: 0.7, matchCount: 1,
    slip: { id, totalOdds: "4.00", selections: [{ fixtureId: id, family: "match-result", selection: "home-win" }] },
    matchStates: [state(id)] });
  const before = { day: "2026-11-05", state: "generated", entitled: true, access: { tier: "full", signedIn: true },
    searchLimited: false, partialCoverage: false, slips: [slip("1"), slip("2")],
    browse: { total: 2, version: "first" } };
  assert.equal(shareUnchanged(before, structuredClone(before)), before);
  const summaryChanged = { ...structuredClone(before), browse: { total: 2, version: "next" } };
  const summary = shareUnchanged(before, summaryChanged);
  assert.deepEqual(summary, summaryChanged);
  assert.equal(summary.slips, before.slips, "browse summary changes do not rebuild watched slips or cards");
  const changed = structuredClone(before);
  changed.slips[0].matchStates[0].score.home = 2;
  const next = shareUnchanged(before, changed);
  assert.deepEqual(next, changed);
  assert.notEqual(next.slips[0], before.slips[0]);
  assert.equal(next.slips[0].slip, before.slips[0].slip);
  assert.equal(next.slips[1], before.slips[1], "unchanged memoized card props retain their identity");
  const revoked = { ...structuredClone(before), entitled: false, access: { tier: "free", signedIn: false },
    slips: before.slips.map(({ id, rank, totalOdds, averageProbability, matchCount }) => ({ id, rank, totalOdds, averageProbability, matchCount })) };
  const publicResult = shareUnchanged(next, revoked);
  assert.deepEqual(publicResult, revoked);
  assert.equal(Object.hasOwn(publicResult.slips[0], "slip"), false);
  assert.equal(Object.hasOwn(publicResult.slips[0], "matchStates"), false);
});
