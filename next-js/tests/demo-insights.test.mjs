import assert from "node:assert/strict";
import test from "node:test";
import { storedMatchInsightsSchema, insightSectionsSchema } from "../src/domain/match-insights.ts";
import { demoApiFootballResponse, demoFixturesForDate, demoFixtureKickoff } from "../src/server/demo/api-football.ts";
import { demoId } from "../src/server/demo/forecast.ts";
import { projectDemoCurrentAvailability, readDemoCurrentAvailability } from "../src/server/demo/insights.ts";
import { publicFixtureVenue, publicRefereeAssignment } from "../src/server/matches/insights-read.ts";
import { freezeEvidence } from "../src/server/evidence/evidence-input.ts";

const finishedAt = Date.parse("2026-12-02T00:00:00Z");
function fixtureCase() {
  const raw = demoFixturesForDate("2026-11-02", finishedAt).find((row) => row.fixture.status.short === "FT");
  assert.ok(raw);
  const kickoff = demoFixtureKickoff(raw.fixture.id), before = kickoff - 41 * 60_000, after = kickoff - 39 * 60_000;
  const team = (side) => ({ id: demoId("team", raw.teams[side].id), name: raw.teams[side].name, logoUrl: raw.teams[side].logo });
  const binding = { provider: "api-football", externalId: BigInt(raw.fixture.id), homeTeamId: team("home").id, awayTeamId: team("away").id,
    facts: { providerFixtureId: BigInt(raw.fixture.id), venueName: raw.fixture.venue.name, venueCity: raw.fixture.venue.city, infoRetrievedAt: new Date(before - 1_000) } };
  const stored = freezeEvidence(storedMatchInsightsSchema.parse({ fixtureId: demoId("fixture", raw.fixture.id), asOf: before,
    home: team("home"), away: team("away"), sections: {
      form: { home: [], away: [] }, h2h: { meetings: [] }, stats: { evidence: [{ metric: "Historical scoring", unit: "goals",
        home: { average: 1.4, samples: 8 }, away: { average: 1.2, samples: 8 } }], evidenceRetrievedAt: before },
      lineups: { home: null, away: null }, players: { players: [{ id: 199_999_999, team: "home", name: "Stored injury profile",
        number: null, position: null, grid: null, role: null }] },
      injuries: { injuries: [{ team: "home", playerId: 199_999_999, playerName: "Stored injury profile", status: "out", type: "Missing Fixture",
        reason: "Injury", updatedAt: before, retrievedAt: before, source: "Stored source" }] },
      news: { items: [{ id: "original-analysis", kind: "analysis", publisher: "Original forecast", title: "Immutable forecast explanation",
        url: null, publishedAt: before, retrievedAt: null, details: [] }], limitedNews: false },
      context: { competition: { id: demoId("competition", raw.league.id), name: raw.league.name, country: raw.league.country,
        logoUrl: raw.league.logo, round: raw.league.round }, kickoffAt: kickoff, restDays: { home: 3, away: 3 },
        lastResults: { home: null, away: null }, nextFixtures: { home: null, away: null } },
      referee: { state: "not-available" }, history: { state: "available" },
    } }));
  return { raw, kickoff, before, after, binding, stored };
}

test("demo insights gain current confirmed lineups and players when the clock crosses publication", () => {
  const { stored, binding, before, after, kickoff } = fixtureCase(), original = JSON.stringify(stored);
  const early = projectDemoCurrentAvailability(stored, binding, before);
  assert.deepEqual(early.sections.lineups, { home: null, away: null });
  assert.equal(early.sections.players.players.length, 1, "only the stored injury profile is known before lineups");
  const confirmed = projectDemoCurrentAvailability(stored, binding, after);
  assert.equal(confirmed.asOf, after);
  for (const side of ["home", "away"]) {
    const lineup = confirmed.sections.lineups[side];
    assert.equal(lineup.status, "confirmed"); assert.equal(lineup.starters.length, 11); assert.equal(lineup.substitutes.length, 9);
    assert.equal(lineup.retrievedAt, after); assert.equal(lineup.updatedAt, null);
    assert.ok(lineup.starters.every((player) => player.team === side && player.role === "starting" && player.grid));
  }
  assert.equal(confirmed.sections.players.players.length, 41);
  const live = projectDemoCurrentAvailability(stored, binding, kickoff + 75 * 60_000);
  assert.equal(live.sections.players.players.length, 41);
  assert.equal(JSON.stringify(stored), original, "the frozen stored snapshot is never rewritten");
  for (const name of ["form", "h2h", "stats", "injuries", "referee", "history"]) {
    assert.deepEqual(confirmed.sections[name], stored.sections[name], `${name} remains the original projection`);
  }
  assert.deepEqual(confirmed.sections.news.items.filter((item) => item.kind === "analysis"), stored.sections.news.items);
  for (const [key, value] of Object.entries(stored.sections.context)) assert.deepEqual(confirmed.sections.context[key], value);
});

test("moving the observation clock back does not leak a later confirmed roster", () => {
  const { stored, binding, before, after } = fixtureCase();
  const later = projectDemoCurrentAvailability(stored, binding, after);
  const earlier = projectDemoCurrentAvailability(later, binding, before);
  assert.deepEqual(earlier.sections.lineups, { home: null, away: null });
  assert.deepEqual(earlier.sections.players, stored.sections.players);
  assert.equal(earlier.sections.news.items.some((item) => item.id.includes("-lineup-")), false, "later lineup reports do not leak backwards");
});

test("current availability resolves the exact stored canonical provider binding", async () => {
  const { stored, binding, after } = fixtureCase(), calls = [];
  const tx = { footballFixture: { async findUnique(query) { calls.push(query); return binding; } } };
  const value = await readDemoCurrentAvailability(tx, stored, after);
  assert.equal(value.sections.lineups.home.starters.length, 11);
  assert.deepEqual(calls, [{ where: { id: stored.fixtureId }, select: { provider: true, externalId: true, homeTeamId: true, awayTeamId: true,
    facts: { select: { providerFixtureId: true, venueName: true, venueCity: true, infoRetrievedAt: true } } } }]);
  for (const mismatch of [{ ...binding, provider: "other" }, { ...binding, externalId: 1n },
    { ...binding, homeTeamId: binding.awayTeamId }, { ...binding, awayTeamId: binding.homeTeamId }]) {
    assert.equal(projectDemoCurrentAvailability(stored, mismatch, after), stored, "foreign identities are untouched");
  }
  assert.equal(await readDemoCurrentAvailability({ footballFixture: { async findUnique() { return null; } } }, stored, after), stored);
});

test("demo context uses bound observed venue facts and the corresponding raw standings", () => {
  const { raw, stored, binding, after } = fixtureCase();
  const projected = projectDemoCurrentAvailability(stored, binding, after), context = projected.sections.context;
  assert.deepEqual(context.venue, { name: raw.fixture.venue.name, city: raw.fixture.venue.city, retrievedAt: binding.facts.infoRetrievedAt.getTime() });
  const standings = demoApiFootballResponse("standings", { league: String(raw.league.id), season: "2026" }, after).response[0].league.standings.flat();
  for (const side of ["home", "away"]) {
    const row = standings.find((entry) => entry.team.id === raw.teams[side].id);
    assert.deepEqual(context.standings[side], { rank: row.rank, points: row.points, played: row.all.played, group: row.group });
  }
  const unboundVenue = projectDemoCurrentAvailability(stored, { ...binding, facts: { ...binding.facts, providerFixtureId: 1n } }, after);
  assert.equal(unboundVenue.sections.context.venue, null);
});

test("auxiliary reports are clearly synthetic and never become raw provider news or rewrite analysis", () => {
  const { raw, stored, binding, before, after } = fixtureCase();
  const early = projectDemoCurrentAvailability(stored, binding, before), later = projectDemoCurrentAvailability(stored, binding, after);
  const earlyReports = early.sections.news.items.filter((item) => item.kind === "report");
  assert.ok(earlyReports.length >= 2, "a schedule briefing and observed injury report populate reports before lineups");
  const reports = later.sections.news.items.filter((item) => item.kind === "report");
  assert.ok(reports.some((item) => item.id.endsWith("lineup-home"))); assert.ok(reports.some((item) => item.id.endsWith("lineup-away")));
  assert.ok(reports.every((item) => item.publisher === "Goal Hint synthetic demo" && item.title.startsWith("Demo report:") && item.url === null));
  assert.ok(reports.every((item) => item.publishedAt <= after && item.retrievedAt === after));
  assert.deepEqual(later.sections.news.items.filter((item) => item.kind === "analysis"), stored.sections.news.items);
  assert.equal("news" in demoApiFootballResponse("fixtures", { id: String(raw.fixture.id) }, after).response[0], false);
});

test("referee assignment projects an observed same-fixture fact without fabricating statistics", () => {
  const asOf = Date.parse("2026-10-28T09:00:00Z"), facts = { providerFixtureId: 900_300_001n,
    referee: "  Samuel Taylor, England  ", infoRetrievedAt: new Date(asOf - 1_000) };
  const available = publicRefereeAssignment(facts.providerFixtureId, facts, asOf);
  assert.deepEqual(available, { state: "available", name: "Samuel Taylor, England", retrievedAt: asOf - 1_000 });
  assert.deepEqual(insightSectionsSchema.shape.referee.parse(available), available);
  for (const missing of [null, { ...facts, referee: "  " }, { ...facts, infoRetrievedAt: null },
    { ...facts, infoRetrievedAt: new Date(asOf + 1) }, { ...facts, providerFixtureId: 1n }]) {
    assert.deepEqual(publicRefereeAssignment(facts.providerFixtureId, missing, asOf), { state: "not-available" });
  }
});

test("venue facts require a same-fixture identity, a name and an observation no later than the read clock", () => {
  const asOf = Date.parse("2026-10-28T09:00:00Z"), facts = { providerFixtureId: 900_300_001n,
    venueName: "  City Stadium  ", venueCity: "  Kampala  ", infoRetrievedAt: new Date(asOf - 1_000) };
  assert.deepEqual(publicFixtureVenue(facts.providerFixtureId, facts, asOf), { name: "City Stadium", city: "Kampala", retrievedAt: asOf - 1_000 });
  for (const missing of [null, { ...facts, venueName: " " }, { ...facts, infoRetrievedAt: null },
    { ...facts, infoRetrievedAt: new Date(asOf + 1) }, { ...facts, providerFixtureId: 1n }]) {
    assert.equal(publicFixtureVenue(facts.providerFixtureId, missing, asOf), null);
  }
});
