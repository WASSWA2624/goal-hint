import assert from "node:assert/strict";
import test from "node:test";
import { settleFeaturedPick } from "../src/server/matches/featured-settlement.ts";

const kickoff = new Date("2026-11-21T19:00:00.000Z"), observedAt = kickoff.getTime() + 110 * 60_000;
const fixture = { fixtureId: "cobresal-audited-fixture", kickoff, status: "finished-regulation", regulationHome: 3, regulationAway: 2,
  regulationVerifiedAt: new Date(observedAt), regulationEvidenceRef: "verified-regulation", issue: null, cycleState: "closed", voidReason: null };
const result = { fixtureId: fixture.fixtureId, status: fixture.status, observedAt, regulationVerifiedAt: observedAt,
  regulation: { verified: true, home: 3, away: 2, evidenceRef: fixture.regulationEvidenceRef },
  halfTime: { verified: true, period: "first-half-including-stoppage-time", home: 1, away: 0, evidenceRef: "verified-half-time" } };

test("the displayed selection, not an archived recommendation, settles a verified 3–2 fixture", () => {
  const settle = (key, selection = "under") => settleFeaturedPick({ key, selection }, fixture, result).status;
  assert.equal(settle("goal:full-time:totals:total:4.5:binary"), "incorrect");
  assert.equal(settle("goal:full-time:totals:total:5.5:binary"), "correct");
  assert.equal(settle("goal:full-time:totals:away:2.5:binary"), "correct");
  assert.equal(settle("goal:half-time:totals:total:1.5:binary"), "correct");
  assert.equal(settle("goal:second-half:totals:total:2.5:binary"), "incorrect");
  assert.equal(settle("total-goals", "over-2.5"), "correct");
});

test("parts, pushes, corrections and voids keep the displayed pick's actual grade", () => {
  const pick = { key: "goal:full-time:totals:away:2.25:asian", selection: "under" };
  assert.equal(settleFeaturedPick(pick, fixture, result).status, "half-win");
  assert.equal(settleFeaturedPick({ ...pick, selection: "over" }, fixture, result).status, "half-loss");
  assert.equal(settleFeaturedPick({ ...pick, key: "goal:full-time:totals:away:2:asian" }, fixture, result).status, "push");
  assert.equal(settleFeaturedPick(pick, fixture, { ...result, observedAt: kickoff.getTime() }).status, "pending");
  assert.equal(settleFeaturedPick(pick, { ...fixture, issue: "canonical-result-correction" }, result).status, "pending");
  assert.equal(settleFeaturedPick(pick, { ...fixture, cycleState: "void", voidReason: "formal-postponement" }, result).status, "void");
  assert.equal(settleFeaturedPick({ key: "goal:unsupported", selection: "under" }, fixture, result).status, "unavailable");
});
