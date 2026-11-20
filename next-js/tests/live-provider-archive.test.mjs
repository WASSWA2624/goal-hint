import assert from "node:assert/strict";
import { test } from "node:test";
import { API_FOOTBALL_CONTRACT_VERSION } from "../src/server/football/api-football-contract.ts";
import { bindLiveProviderArchive } from "../src/server/live/live-provider-archive.ts";

test("live archive retains private status and approved football envelopes outside the structured odds policy", async () => {
  const saved = [], replayed = [];
  const { observeStatus, responseArchive } = bindLiveProviderArchive({
    async save(page) { saved.push(page); },
    async replay(request) { replayed.push(request); return null; },
  });
  const retrievedAt = Date.UTC(2026, 10, 20), body = Buffer.from('{"response":{"account":{"email":"synthetic@example.test"}}}');
  const account = { accountKey: "a".repeat(64), retrievedAt };
  await observeStatus(account, body);
  await observeStatus(account, body);
  assert.equal(saved[0].provenance.endpoint, "accountStatus");
  assert.equal(saved[0].requestKey, saved[1].requestKey);
  assert.notEqual(saved[0].requestKey, account.accountKey);
  assert.equal(saved[0].body, body);

  const requestKey = "b".repeat(64);
  for (const endpoint of ["odds", "oddsMapping", "oddsBets", "oddsBookmakers", "inPlayOdds", "inPlayOddsBets", "fixtures"]) {
    const request = { requestKey, endpoint, requestParameters: {}, contractVersion: API_FOOTBALL_CONTRACT_VERSION };
    await responseArchive.save({ requestKey, rowCount: 0, body, provenance: { ...saved[0].provenance, endpoint } });
    await responseArchive.replay(request);
  }
  assert.deepEqual(saved.slice(2).map(({ provenance }) => provenance.endpoint), ["fixtures"]);
  assert.deepEqual(replayed.map(({ endpoint }) => endpoint), ["fixtures"]);
});
