import assert from "node:assert/strict";
import test from "node:test";
import { compactLeagueName, compactMarketName, compactTeamName } from "../src/domain/compact-fixture-label.ts";
import { publicPolicy } from "../src/domain/public-policy.ts";

test("compact fixture labels shorten familiar names without inventing names for unknown fixtures", () => {
  assert.equal(compactTeamName(" Wolverhampton Wanderers "), "Wolves");
  assert.equal(compactTeamName("Borussia Mönchengladbach"), "M'gladbach");
  assert.equal(compactLeagueName(" Premier League "), "EPL");
  assert.equal(compactLeagueName("Primeira Liga"), "Liga PT");
  for (const name of [" New Club United ", "Université FC", "constructor", "__proto__", ""]) {
    assert.equal(compactTeamName(name), name.trim());
    assert.equal(compactLeagueName(name), name.trim());
  }
});

test("each published market keeps its distinct conventional compact label", () => {
  assert.deepEqual(publicPolicy.markets.map(compactMarketName), ["1X2", "DC", "O/U", "BTTS"]);
});
