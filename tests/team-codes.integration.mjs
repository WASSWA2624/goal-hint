import assert from 'node:assert/strict';
import test from 'node:test';
import { createPredictionWindow, getReportingDate, utcInstantFromEpochMilliseconds } from '../src/domain/calendar.ts';
import { matchFeedRecordSchema } from '../src/domain/match-feed.ts';
import { createFootballCatalogImporter } from '../src/server/football/catalog-service.ts';
import { teamCodeBounds } from '../src/server/live/live-plan.ts';
import { storedFeedFixture } from '../src/server/matches/fixture-read.ts';
import { createMysqlTeamCodeStore, teamCodeScopeKey } from '../src/server/teams/team-code-mysql-store.ts';
import { createTeamCodeService } from '../src/server/teams/team-code-service.ts';
import { catalogFixture, catalogRequest, catalogResponse, catalogTeam, createSyntheticCatalogAdapter } from './helpers/catalog-fixtures.mjs';
import { catalogSelectionAuthority } from './helpers/selection-fixtures.mjs';
import { withPredictionPipeline } from './prediction-pipeline.mjs';

// Team-code import persistence on an owned MySQL 8.4 under the application role's catalog grants (no new table or
// grant). Provider envelopes, team codes and clocks are synthetic; no request leaves the process.
const MINUTE = 60_000, HOUR = 60 * MINUTE, DAY = 24 * HOUR;
const T0 = Date.parse('2026-10-11T06:00:00.000Z');
const iso = (at) => new Date(at).toISOString();
const team = (id, code = null) => catalogTeam(id, { code });
const fixture = (id, competitionId, kickoff, home, away) => catalogFixture(id, { competitionId, kickoff: iso(kickoff), teams: { home, away } });
// Seeded from /fixtures with no codes, except one already-stored code (6102) and one fully coded league (140).
const rows = [
  fixture(55001, 39, T0 + 2 * HOUR, team(3901), team(3902)),
  fixture(55002, 39, T0 + 30 * DAY + 6 * HOUR, team(3902), team(3903)),
  fixture(55003, 61, T0 + 4 * HOUR, team(6101), team(6102, 'PSG')),
  fixture(55004, 94, T0 + 2 * DAY, team(9401), team(9402)),
  fixture(55005, 78, T0 + 6 * HOUR, team(7801), team(7802)),
  fixture(55006, 140, T0 + 3 * HOUR, team(14001, 'RMA'), team(14002, 'BAR')),
  fixture(55007, 135, T0 + 10 * DAY, team(13501), team(13502)),
];
// /teams?league&season answers: codes for most clubs, none for youth sides (league 78 and club 3902).
const leagueTeams = {
  39: [team(3901, 'ars'), team(3902), team(3903, 'CHE'), team(3999, 'NEW')],
  61: [team(6101, 'OL'), team(6102)],
  94: [team(9401, 'POR'), team(9402, 'BEN')],
  78: [team(7801), team(7802)],
};

test('team-code import persistence on isolated genuine MySQL', { timeout: 300_000 }, async (t) => {
  await withPredictionPipeline(t, async (p) => {
    const { a, catalog } = p;
    const realFetch = globalThis.fetch, stray = [];
    globalThis.fetch = async (input) => { stray.push(String(input)); throw new Error('Unexpected network access.'); };
    try {
      const state = { failLeague94: true };
      const provider = createSyntheticCatalogAdapter({ respond: (url) => {
        if (url.pathname === '/fixtures') return catalogResponse(url, rows.filter((row) => String(row.league.id) === url.searchParams.get('league')));
        if (url.pathname === '/teams') {
          const league = url.searchParams.get('league');
          if (league === '94' && state.failLeague94) return catalogResponse(url, [], { status: 500 });
          return catalogResponse(url, (leagueTeams[league] ?? []).map((entry) => ({ team: entry, venue: { id: null, name: null } })));
        }
        return catalogResponse(url, []);
      } });
      const at = (value) => { provider.clock.value = value; p.setTime(value); };
      const importer = createFootballCatalogImporter({ adapter: provider.adapter, store: catalog, authority: catalogSelectionAuthority, clock: provider.clock });
      at(T0 - 10 * MINUTE);
      for (const competitionId of [39, 61, 94, 78, 140, 135]) {
        const receipt = await importer.import(catalogRequest({ kind: 'fixtures', query: { competitionId, season: 2026 } }, p.now()));
        assert.equal(receipt.status === 'failed', false, `seed ${competitionId}`);
      }
      const store = createMysqlTeamCodeStore(a);
      const service = createTeamCodeService({ store, importer, retentionEvidenceRef: 'synthetic-catalog-retention', bounds: teamCodeBounds,
        clock: () => provider.clock.value });
      const teamsCalls = () => provider.network.filter((entry) => entry.url.pathname === '/teams')
        .map((entry) => `${entry.url.searchParams.get('league')}:${entry.url.searchParams.get('season')}`);
      const code = async (externalId) => (await a.query((tx) => tx.footballTeamProvider.findUnique({ where: { provider_externalId: {
        provider: 'api-football', externalId: BigInt(externalId) } }, include: { team: true } })))?.team.code;
      const version = async (externalId) => String((await catalog.fixtureByProviderId(externalId)).dataVersion);
      const sweep = (maxSeasons = 4) => service.sweep({ now: p.now(), maxSeasons, remainingMs: () => 10 * MINUTE });
      const versions = {};
      for (const id of [55001, 55003, 55005, 55006]) versions[id] = await version(id);

      await t.test('candidates are the nearest competition-seasons with codeless teams in the window, read under the catalog grants', async () => {
        at(T0);
        const candidates = await store.candidates({ from: T0 - 3 * HOUR, to: T0 + 8 * DAY }, 50);
        assert.deepEqual(candidates.map((entry) => [entry.competitionId, entry.season, entry.firstKickoff, entry.teamsWithoutCode]),
          [[39, 2026, T0 + 2 * HOUR, 2], [61, 2026, T0 + 4 * HOUR, 1], [78, 2026, T0 + 6 * HOUR, 2], [94, 2026, T0 + 2 * DAY, 2]],
          'league 140 is fully coded, league 135 kicks off after the window, 6102 already has a code');
        assert.ok(candidates.every((entry) => typeof entry.seasonId === 'string' && Object.isFrozen(entry)));
        assert.deepEqual((await store.candidates({ from: T0 - 3 * HOUR, to: T0 + 8 * DAY }, 1)).map((entry) => entry.competitionId), [39]);
        // Keyset pages follow the same order: (earliest kickoff, league id, season), strictly after the cursor.
        const page = async (after, limit = 2) => (await store.candidates({ from: T0 - 3 * HOUR, to: T0 + 8 * DAY }, limit, after))
          .map((entry) => entry.competitionId);
        assert.deepEqual(await page(null), [39, 61]);
        assert.deepEqual(await page(candidates[1]), [78, 94], 'the second page starts after the last candidate of the first');
        assert.deepEqual(await page(candidates[3]), []);
        assert.deepEqual(await page({ firstKickoff: T0 + 4 * HOUR, competitionId: 60, season: 2026 }, 1), [61], 'a kickoff tie orders by league id');
        assert.deepEqual(await page({ firstKickoff: T0 + 4 * HOUR, competitionId: 61, season: 2025 }, 1), [61], 'then by season');
        assert.deepEqual(await page({ firstKickoff: T0 + 4 * HOUR, competitionId: 61, season: 2026 }, 1), [78]);
        await assert.rejects(store.candidates({ from: T0, to: T0 + DAY }, 10, { firstKickoff: T0, competitionId: 0, season: 2026 }), RangeError);
        assert.deepEqual(await store.checks(candidates, T0 - 30 * DAY), new Map(), 'no league has been checked');
        await assert.rejects(store.candidates({ from: T0, to: T0 }, 10), RangeError);
        await assert.rejects(store.candidates({ from: T0, to: T0 + DAY }, 0), RangeError);
      });

      await t.test('one bounded sweep imports the nearest leagues through the catalog: codes stored, existing codes kept, fixtures bumped', async () => {
        at(T0);
        const summary = await sweep(2);
        assert.deepEqual(teamsCalls(), ['39:2026', '61:2026'], 'two seasons per sweep here, nearest kickoff first');
        assert.deepEqual([summary.candidates, summary.due, summary.requestsDispatched, summary.uncertain, summary.stopped],
          [4, 2, 2, false, null]);
        assert.deepEqual(summary.seasons.map((season) => [season.competitionId, season.status, season.importedTeams]),
          [[39, 'complete', 4], [61, 'complete', 2]]);
        assert.deepEqual(await Promise.all([3901, 3902, 3903, 3999, 6101, 6102, 14001].map(code)), ['ars', null, 'CHE', 'NEW', 'OL', 'PSG', 'RMA'],
          'a code the provider omits never erases a stored one; a team without fixtures is created with its code');
        assert.equal(await version(55001), String(BigInt(versions[55001]) + 1n), 'a changed shared team bumps every fixture that renders it');
        assert.equal(await version(55003), String(BigInt(versions[55003]) + 1n));
        assert.equal(await version(55005), versions[55005], 'leagues not swept are untouched');
        assert.equal(await version(55006), versions[55006]);
        const receipts = await a.query((tx) => tx.footballImport.findMany({ where: { kind: 'teams' }, orderBy: { sequence: 'asc' },
          select: { scopeKey: true, status: true, observedAt: true, requestsDispatched: true } }));
        assert.deepEqual(receipts.map((row) => [row.scopeKey, row.status, row.observedAt.getTime(), row.requestsDispatched]),
          [[teamCodeScopeKey({ competitionId: 39, season: 2026 }), 'complete', T0, 1], [teamCodeScopeKey({ competitionId: 61, season: 2026 }), 'complete', T0, 1]]);
      });

      await t.test('the feed and detail read publish the validated code with the bumped version', async () => {
        const fixtureId = (await catalog.fixtureByProviderId(55001)).id, window = createPredictionWindow(getReportingDate(utcInstantFromEpochMilliseconds(T0)));
        const record = await a.query((tx) => storedFeedFixture(tx, fixtureId, false, window, 'en', { prices: false }));
        assert.deepEqual([record.homeTeam.code, record.awayTeam.code, record.dataVersion], ['ARS', null, await version(55001)],
          'the raw provider "ars" reads as ARS; a codeless youth side reads as null');
        assert.equal(matchFeedRecordSchema.parse(record).homeTeam.code, 'ARS');
        const coded = await a.query(async (tx) => storedFeedFixture(tx, (await catalog.fixtureByProviderId(55006)).id, false, window, 'en', { prices: false }));
        assert.deepEqual([coded.homeTeam.code, coded.awayTeam.code], ['RMA', 'BAR']);
      });

      await t.test('checked markers: a codeless league waits 30 days, a failed answer backs off for a day', async () => {
        at(T0 + MINUTE);
        let summary = await sweep();
        assert.deepEqual(teamsCalls().slice(2), ['78:2026', '94:2026', '94:2026'], '39 is checked; the 94 import retries once, then fails');
        assert.deepEqual([summary.due, summary.stopped, summary.seasons.map((season) => [season.competitionId, season.status])],
          [2, 'failed-receipt', [[78, 'complete'], [94, 'failed']]]);
        assert.deepEqual(await Promise.all([7801, 7802, 9401].map(code)), [null, null, null]);
        const checks = await store.checks([39, 61, 78, 94, 140].map((competitionId) => ({ competitionId, season: 2026 })), T0 - 30 * DAY);
        assert.deepEqual(checks.get(teamCodeScopeKey({ competitionId: 39, season: 2026 })), { settledAt: T0, failedAt: null });
        assert.deepEqual(checks.get(teamCodeScopeKey({ competitionId: 78, season: 2026 })), { settledAt: T0 + MINUTE, failedAt: null });
        assert.equal(checks.get(teamCodeScopeKey({ competitionId: 94, season: 2026 })).settledAt, null);
        assert.ok(checks.get(teamCodeScopeKey({ competitionId: 94, season: 2026 })).failedAt >= T0 + MINUTE);
        assert.equal(checks.has(teamCodeScopeKey({ competitionId: 140, season: 2026 })), false);

        at(T0 + 2 * MINUTE);
        const before = teamsCalls().length;
        summary = await sweep();
        assert.deepEqual([summary.candidates, summary.due, summary.seasons.length, teamsCalls().length], [3, 0, 0, before],
          'every candidate was checked recently: no request');

        state.failLeague94 = false;
        at(T0 + DAY + 2 * MINUTE);
        summary = await sweep();
        assert.deepEqual(teamsCalls().slice(before), ['94:2026'], 'after a day the failed league is retried; the others left the window');
        assert.deepEqual(await Promise.all([9401, 9402].map(code)), ['POR', 'BEN']);

        at(T0 + 29 * DAY);
        summary = await sweep();
        assert.deepEqual([summary.candidates, summary.due, teamsCalls().length], [1, 0, before + 1],
          'league 39 is back in the window with a codeless club, but its stored answer is 29 days old');
        at(T0 + 30 * DAY + MINUTE);
        summary = await sweep();
        assert.deepEqual(teamsCalls().slice(before + 1), ['39:2026'], 'after 30 days the league is asked again');
        assert.equal(summary.seasons[0].status, 'complete');
        assert.equal(await code(3902), null);
      });

      await t.test('the application role cannot rewrite or delete the receipts that serve as markers', async () => {
        await assert.rejects(a.query((tx) => tx.$executeRawUnsafe("UPDATE FootballImport SET observedAt = observedAt WHERE kind = 'teams'")));
        await assert.rejects(a.query((tx) => tx.$executeRawUnsafe("DELETE FROM FootballImport WHERE kind = 'teams'")));
      });
      assert.deepEqual(stray, []);
    } finally { globalThis.fetch = realFetch; }
  });
});
