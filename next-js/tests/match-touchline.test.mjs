import test from "node:test";
import assert from "node:assert/strict";
import { matchDetailTabs, detailTabForView, openDetailTab, hasMatchPredictionAccess } from "../src/domain/match-detail-tabs.ts";
import { parseMatchView, serializeMatchView, splitMatchViewParameters, openItem } from "../src/domain/match-view.ts";
import { horizontalPitchPositions } from "../src/domain/match-details.ts";

test("Touchline tabs preserve deep links, revision state and their own section controls", () => {
  for (const panel of matchDetailTabs) {
    const view = openDetailTab(parseMatchView({ section: "players", item: "home-1", page: "4" }), panel);
    const parameters = serializeMatchView(view, new URLSearchParams("revision=kept&cycleAnchor=7"));
    assert.equal(parameters.get("revision"), "kept"); assert.equal(parameters.get("cycleAnchor"), "7");
    assert.equal(detailTabForView(parseMatchView(parameters)), panel); assert.equal(view.item, null); assert.equal(view.page, 1);
    const split = splitMatchViewParameters(Object.fromEntries(parameters));
    assert.equal(split.view.panel, panel); assert.deepEqual(split.rest, { revision: "kept", cycleAnchor: "7" });
  }
  for (const [section, panel] of [["form", "stats"], ["players", "lineups"], ["injuries", "lineups"], ["history", "analysis"], ["referee", "venue"]]) {
    assert.equal(detailTabForView(parseMatchView({ section })), panel);
  }
  assert.equal(detailTabForView(parseMatchView({ market: "total-goals" })), "markets");
  assert.equal(detailTabForView(openItem(openDetailTab(parseMatchView({}), "stats"), "news", "article-1")), "analysis");
  assert.equal(parseMatchView({ panel: "invalid" }).panel, null);
});

test("Touchline UI entitlement follows verified completion or full paid/earned access", () => {
  for (const tier of ["free", "full"]) for (const signedIn of [true, false]) for (const status of ["scheduled", "live", "postponed", "unknown", "finished-regulation", "finished-extra-time", "finished-penalties", "canceled", "abandoned", "awarded"]) {
    assert.equal(hasMatchPredictionAccess({ access: { tier, signedIn }, fixture: { status } }),
      tier === "full" || ["finished-regulation", "finished-extra-time", "finished-penalties", "canceled", "abandoned", "awarded"].includes(status), `${tier}/${signedIn}/${status}`);
  }
});

test("horizontal formations keep every starter on their own half and rotate the away team", () => {
  const squad = ["1:1", "2:1", "2:2", "2:3", "2:4", "3:1", "3:2", "3:3", "4:1", "4:2", "4:3"]
    .map((grid, id) => ({ grid, id }));
  const home = horizontalPitchPositions(squad, "home"), away = horizontalPitchPositions(squad, "away");
  assert.equal(home.length, 11); assert.equal(away.length, 11);
  assert.equal(home[0].x, 7); assert.equal(away[0].x, 93);
  for (const [i, position] of home.entries()) {
    assert.equal(position.player, squad[i]); assert.equal(away[i].player, squad[i]);
    assert.ok(position.x > 0 && position.x < 50); assert.ok(away[i].x > 50 && away[i].x < 100);
    assert.ok(position.y > 0 && position.y < 100);
    assert.equal(position.x + away[i].x, 100); assert.equal(position.y + away[i].y, 100);
  }
  assert.equal(horizontalPitchPositions([], "home"), null);
  assert.equal(horizontalPitchPositions([{ grid: null }], "home"), null);
  assert.equal(horizontalPitchPositions([...squad.slice(1), { grid: null }], "away"), null);
});
