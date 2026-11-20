import assert from "node:assert/strict";
import test from "node:test";
import { normalizeFixture } from "../src/server/football/api-football-normalize.ts";
import { createLiveDiscoveryImport } from "../src/server/live/live-discovery-import.ts";
import { catalogFixture, CATALOG_NOW } from "./helpers/catalog-fixtures.mjs";

test("live discovery adopts authorized unknown IDs from the original response", async () => {
  const imports = [];
  const discover = createLiveDiscoveryImport({ competitionIds: [39], retentionEvidenceRef: "test-ref", importer: {
    async importObservation(request, response) { imports.push({ request, response }); },
  } });
  const fixtures = [catalogFixture(1), catalogFixture(2, { competitionId: 40 }), catalogFixture(3)].map(row =>
    ({ ...normalizeFixture(row, { retrievedAt: CATALOG_NOW, endpoint: "/fixtures" }).data, facts: { retained: true } }));
  const response = { status: "complete", data: fixtures, requestsDispatched: 1, error: null,
    provenance: [{ endpoint: "fixtures", quota: { kind: "success" }, retrievedAt: CATALOG_NOW,
      requestParameters: { live: "all", timezone: "Africa/Kampala" }, fromCache: false }],
    completeness: { complete: true, missingIds: [], missingCoverage: [], reasons: [], invalidRows: 0 },
  };
  await discover(response, { channel: "live", unknownIds: [1, 2] });
  await discover(response, { channel: "live", unknownIds: [2, 1] });
  assert.equal(imports[0].request.id, imports[1].request.id);
  assert.deepEqual(imports[0].request.selection.query, { live: true });
  assert.deepEqual(imports[0].response.data.map(({ id }) => id), [1]);
  assert.equal(Object.hasOwn(imports[0].response.data[0], "facts"), false);
  assert.equal(imports[0].response.status, "partial");
  await discover(response, { channel: "live", unknownIds: [1], signal: AbortSignal.abort() });
  assert.equal(imports.length, 2);
});
