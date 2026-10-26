import assert from "node:assert/strict";
import test from "node:test";
import { createFootballCatalogImporter } from "../src/server/football/catalog-service.ts";
import { CatalogInputError, assertCatalogPreparedBatch, catalogRequestFingerprint } from "../src/server/football/catalog-input.ts";
import { CatalogStoreError } from "../src/server/football/catalog-mysql-store.ts";
import { catalogFixture, catalogRequest, createSyntheticCatalogAdapter } from "./helpers/catalog-fixtures.mjs";

// Synthetic permissions and provider transport only. Actual 007 normalization,
// counted gateway dispatch and 009 input validation run without network/database I/O.
const selection = { kind: "fixtures", query: { competitionId: 39, season: 2026 } };
const clone = (value) => structuredClone(value);
function deferred() {
  let resolve;
  const promise = new Promise((value) => { resolve = value; });
  return { promise, resolve };
}
function setup({ existing = null, findImport, permissions = {}, provider = {} } = {}) {
  const source = createSyntheticCatalogAdapter({ rows: [catalogFixture()], ...provider });
  const authority = {
    authorize() {}, authorizeMapping() {}, verifyRetention: () => true, verifyObservation: () => true,
    verifyLogo: () => true, verifyRegulationScore: () => true, verifyMapping: () => true,
    regulationEvidenceRef: () => "synthetic-regulation-proof", ...permissions,
  };
  const lookups = [], writes = [];
  const store = {
    async findImport(id) { lookups.push(id); return findImport ? findImport(id) : existing; },
    async importBatch(batch) {
      assertCatalogPreparedBatch(batch);
      writes.push(batch);
      return Object.freeze({ id: batch.request.id, requestFingerprint: batch.requestFingerprint, fingerprint: batch.fingerprint,
        status: batch.status, observedAt: batch.observedAt, recordedAt: source.clock.now(), receivedCount: batch.rows.fixtures.length,
        importedCount: batch.rows.fixtures.length, rejectedCount: batch.invalidRows, requestsDispatched: batch.requestsDispatched,
        fixtureIds: Object.freeze([]), changedFixtureIds: Object.freeze([]), reasons: batch.reasons });
    },
  };
  const importer = createFootballCatalogImporter({ adapter: source.adapter, store, authority, clock: source.clock });
  return { source, authority, store, importer, lookups, writes };
}
const invoke = (state, input) => Promise.resolve().then(() => state.importer.import(input));
const denied = (reason) => (error) => error instanceof CatalogInputError && error.reason === reason &&
  !error.message.includes("synthetic-private-key");

test("invalid requests and revoked operation/retention authorization stop before store lookups or provider requests", async () => {
  for (const permissions of [{ authorize() { throw new Error("synthetic-private-key"); } }, { verifyRetention: () => false },
    { verifyRetention() { throw new Error("synthetic-private-key"); } }]) {
    const state = setup({ permissions });
    await assert.rejects(invoke(state, catalogRequest(selection)), (error) => error instanceof CatalogInputError);
    assert.equal(state.lookups.length, 0); assert.equal(state.source.network.length, 0); assert.equal(state.writes.length, 0);
  }
  const state = setup();
  await assert.rejects(invoke(state, { ...catalogRequest(selection), providerPayload: "synthetic-private-key" }), denied("invalid-request"));
  assert.equal(state.lookups.length, 0); assert.equal(state.source.network.length, 0);
});

test("truthy non-boolean retention verifier results cannot authorize outbound requests", async () => {
  const state = setup({ permissions: { verifyRetention: () => "unverified-truthy-value" } });
  await assert.rejects(invoke(state, catalogRequest(selection)), denied("retention-not-authorized"));
  assert.equal(state.lookups.length, 0); assert.equal(state.source.network.length, 0);
});

test("an already committed identical request returns its original import without new provider I/O", async () => {
  const input = catalogRequest(selection);
  const previous = Object.freeze({ id: input.id, requestFingerprint: catalogRequestFingerprint(input),
    fingerprint: "synthetic-committed-content", requestsDispatched: 1, observedAt: 123 });
  const state = setup({ existing: previous });
  const result = await invoke(state, input);
  assert.equal(result, previous); assert.equal(state.lookups.length, 1);
  assert.equal(state.source.network.length, 0); assert.equal(state.writes.length, 0);
});

test("a committed import ID with changed request intent fails before new provider I/O", async () => {
  const input = catalogRequest(selection), changed = clone(input); changed.bounds.maxRequests++;
  const state = setup({ existing: { id: input.id, requestFingerprint: catalogRequestFingerprint(input) } });
  await assert.rejects(invoke(state, changed), (error) => error instanceof CatalogStoreError && error.reason === "conflicting-import");
  assert.equal(state.source.network.length, 0); assert.equal(state.writes.length, 0);
});

test("equivalent in-flight requests share one lookup, counted adapter operation and immutable validated batch", async () => {
  const gate = deferred(), state = setup({ findImport: () => gate.promise }), input = catalogRequest(selection);
  const first = state.importer.import(input), second = state.importer.import(clone(input));
  assert.equal(state.lookups.length, 1); assert.equal(state.source.network.length, 0);
  gate.resolve(null);
  const [one, two] = await Promise.all([first, second]);
  assert.equal(one, two); assert.equal(state.source.network.length, 1); assert.equal(state.source.requests.length, 1);
  assert.equal(state.source.completions.length, 1); assert.equal(state.writes.length, 1);
  assert.equal(state.writes[0].status, "complete"); assert.equal(state.writes[0].requestsDispatched, 1);
  assert.ok(Object.isFrozen(state.writes[0].rows.fixtures[0].source));
});

test("changed intent cannot join an existing import ID while its first operation is pending", async () => {
  const gate = deferred(), state = setup({ findImport: () => gate.promise }), input = catalogRequest(selection);
  const first = state.importer.import(input), changed = clone(input); changed.selection.query.season = 2025;
  await assert.rejects(state.importer.import(changed), (error) => error instanceof CatalogStoreError && error.reason === "conflicting-import");
  assert.equal(state.lookups.length, 1); assert.equal(state.source.network.length, 0);
  gate.resolve(null); await first;
  assert.equal(state.source.network.length, 1); assert.equal(state.writes.length, 1);
});

test("authorization is rechecked after store lookup and before serving an existing import", async () => {
  const gate = deferred(); let permitted = true;
  const input = catalogRequest(selection), state = setup({ findImport: () => gate.promise,
    permissions: { authorize() { if (!permitted) throw new Error("synthetic-private-key"); } } });
  const pending = state.importer.import(input);
  permitted = false;
  gate.resolve({ id: input.id, requestFingerprint: catalogRequestFingerprint(input) });
  await assert.rejects(pending, denied("operation-not-authorized"));
  assert.equal(state.source.network.length, 0); assert.equal(state.writes.length, 0);
});

test("revoked retention while lookup is pending prevents dispatch and clears the in-flight entry", async () => {
  const gate = deferred(); let permitted = true, lookups = 0;
  const state = setup({ findImport: () => ++lookups === 1 ? gate.promise : null,
    permissions: { verifyRetention: () => permitted } }), input = catalogRequest(selection);
  const pending = state.importer.import(input); permitted = false; gate.resolve(null);
  await assert.rejects(pending, denied("retention-not-authorized"));
  assert.equal(state.source.network.length, 0); assert.equal(state.writes.length, 0);
  permitted = true;
  await invoke(state, input);
  assert.equal(state.lookups.length, 2); assert.equal(state.source.network.length, 1); assert.equal(state.writes.length, 1);
});

test("observation verification cannot be bypassed by injecting structured-looking provider rows", async () => {
  const state = setup({ permissions: { verifyObservation: () => false } });
  await assert.rejects(invoke(state, catalogRequest(selection)), denied("unverified-observation"));
  assert.equal(state.source.network.length, 1); assert.equal(state.source.requests.length, 1);
  assert.equal(state.source.completions.length, 1); assert.equal(state.writes.length, 0);
});

test("revocation after counted provider I/O prevents catalog retention without losing the gateway completion", async () => {
  let permitted = true;
  const state = setup({ permissions: { authorize() { if (!permitted) throw new Error("synthetic-private-key"); } } });
  const original = state.source.adapter.evidence.fixtures;
  const evidence = { ...state.source.adapter.evidence, fixtures: async (...args) => {
    const result = await original(...args); permitted = false; return result;
  } };
  const importer = createFootballCatalogImporter({ adapter: { ...state.source.adapter, evidence },
    store: state.store, authority: state.authority, clock: state.source.clock });
  await assert.rejects(Promise.resolve().then(() => importer.import(catalogRequest(selection))), denied("operation-not-authorized"));
  assert.equal(state.source.network.length, 1); assert.equal(state.source.completions.length, 1);
  assert.equal(state.writes.length, 0);
});
