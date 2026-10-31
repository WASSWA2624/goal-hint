import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import { createReviewServer } from "../design/match-details-desktop/server.mjs";
import { variants, tabs, viewers, statuses, reviewState } from "../design/match-details-desktop/catalog.mjs";

test("match review serves ten designs and eight independently addressable sections", () => {
  assert.equal(variants.length, 10); assert.equal(new Set(variants.map(item => item.id)).size, 10);
  assert.equal(tabs.length, 8); assert.equal(new Set(tabs.map(item => item.id)).size, 8);
  assert.deepEqual(reviewState(new URLSearchParams("variant=bad&tab=bad&status=bad&viewer=bad")),
    { variant: "touchline", tab: "stats", viewer: "subscriber", status: "scheduled" });
  const selected = { variant: "dugout", tab: "lineups", viewer: "referral", status: "live" };
  assert.deepEqual(reviewState(new URLSearchParams(selected)), selected);
});

test("HTTP preview withholds predictive data for every locked viewer/status pair and never serves source fixtures", async t => {
  const server = createReviewServer(); server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const viewer of viewers) for (const status of statuses) {
    const response = await fetch(`${origin}/api/fixture?viewer=${viewer.id}&status=${status.id}`);
    assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
    const fixture = await response.json();
    const allowed = status.id === "finished-regulation" || ["subscriber", "referral"].includes(viewer.id);
    assert.equal(fixture.canView, allowed, `${viewer.id}/${status.id}`);
    if (!allowed) {
      assert.equal(fixture.forecasts, null);
      assert.doesNotMatch(JSON.stringify(fixture), /"probability"|"odds"|"selection"|"explanation"|"scenarios"/u);
    } else {
      assert.ok(fixture.forecasts.featured.probability > 0);
      assert.ok(fixture.forecasts.markets.every(row => row.id !== fixture.forecasts.featured.id), "featured selection is not repeated");
      assert.ok(fixture.forecasts.markets.some(row => row.odds === null), "missing odds stay missing");
    }
    assert.equal(fixture.squads.reduce((count, squad) => count + squad.starters.length, 0), 22);
  }
  for (const query of ["", "?viewer=owner", "?viewer=guest&status=unknown", "?viewer=member&status=postponed"]) {
    assert.equal((await (await fetch(`${origin}/api/fixture${query}`)).json()).forecasts, null);
  }
  for (const path of ["/sample.mjs", "/server.mjs", "/.env.local", "/package.json", "/src/domain/paywall.ts", "/unknown"]) {
    assert.equal((await fetch(origin + path)).status, 404, path);
  }
  for (const path of ["/", "/review.mjs", "/catalog.mjs", "/styles.css", "/brand.css", "/logo.svg", "/Manrope.woff2"]) {
    assert.equal((await fetch(origin + path)).status, 200, path);
  }
  const head = await fetch(origin + "/", { method: "HEAD" }); assert.equal(head.status, 200); assert.equal(await head.text(), "");
  assert.equal((await fetch(origin + "/api/fixture", { method: "POST" })).status, 405);
});
