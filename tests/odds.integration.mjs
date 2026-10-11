import assert from 'node:assert/strict';
import { execFile } from "./helpers/command-runtime.mjs";
import { promisify } from 'node:util';
import test from 'node:test';
import { deMargin, parseDecimalOdds } from '../src/domain/odds.ts';
import { evidenceFingerprint } from '../src/server/evidence/evidence-input.ts';
import { createFootballCatalogImporter } from '../src/server/football/catalog-service.ts';
import { OddsError } from '../src/server/odds/odds-contract.ts';
import { oddsPolicyHash } from '../src/server/odds/odds-input.ts';
import { createMysqlOddsStore, oddsValuesHash } from '../src/server/odds/odds-mysql-store.ts';
import { storedFixtureOddsGroups, storedFixturePrices } from '../src/server/odds/odds-read.ts';
import { createOddsImportService } from '../src/server/odds/odds-service.ts';
import { catalogFixture, catalogRequest, createSyntheticCatalogAdapter } from './helpers/catalog-fixtures.mjs';
import { catalogSelectionAuthority } from './helpers/selection-fixtures.mjs';
import { createSyntheticOddsAdapter, launchBetCatalog, launchBets, ODDS_BOOKMAKER, oddsAuthority, oddsBounds, oddsHash, oddsPolicy,
  oddsRequest, oddsResponse, offsetTime, rawOddsRow } from './helpers/odds-fixtures.mjs';
import { withPredictionPipeline } from './prediction-pipeline.mjs';

// Prompt 052 persistence on an owned MySQL 8.4 with the application role's exact odds grants. Provider
// envelopes, bookmakers, prices, approvals and clocks are synthetic; no request leaves the process.
const execute = promisify(execFile), MINUTE = 60_000, HOUR = 60 * MINUTE, DAY = 24 * HOUR;
const T0 = Date.parse('2026-10-11T06:00:00.000Z');
const NEXT = '2026-10-13', LATER = '2026-10-14';
const iso = (at) => new Date(at).toISOString();
const kickoffs = {
  A: Date.parse('2026-10-13T09:00:00Z'), B: Date.parse('2026-10-13T12:00:00Z'), C: Date.parse('2026-10-13T15:00:00Z'),
  M: Date.parse('2026-10-13T17:00:00Z'), P: Date.parse('2026-10-13T18:00:00Z'),
  S: Date.parse('2026-10-13T22:00:00Z'), E: Date.parse('2026-10-14T18:00:00Z'),
};
const ids = { A: 52001, B: 52002, C: 52003, M: 52004, P: 52005, S: 52010, E: 52011 };
const UNKNOWN = 59999;
const denied = (reason) => (error) => error instanceof OddsError && error.reason === reason;
const violates = (pattern) => (error) => pattern.test(`${error.stderr ?? ''}${error.message ?? ''}`);
const asBool = (value) => value === true || value === 1 || value === 1n || value === '1';
const scaled = (value) => BigInt(value.replace('.', ''));

test('odds import persistence on isolated genuine MySQL', { timeout: 300_000 }, async (t) => {
  await withPredictionPipeline(t, async (p) => {
    const { a, b, catalog } = p;
    const realFetch = globalThis.fetch, stray = [];
    globalThis.fetch = async (input) => { stray.push(String(input)); throw new Error('Unexpected network access.'); };
    try {
      p.setTime(T0);
      const accountId = oddsHash('synthetic-odds-quota-account');
      await a.query((tx) => tx.apiQuotaAccount.create({ data: { id: accountId } }));
      const catalogRows = Object.entries(ids).map(([key, id], index) => catalogFixture(id, { kickoff: iso(kickoffs[key]),
        homeId: 7000 + index * 2, awayId: 7001 + index * 2, status: key === 'P' ? 'PST' : 'NS' }));
      const seed = createSyntheticCatalogAdapter({ rows: catalogRows });
      seed.clock.value = T0 - 61_000; p.setTime(seed.clock.value);
      const seeded = await createFootballCatalogImporter({ adapter: seed.adapter, store: catalog, authority: catalogSelectionAuthority, clock: seed.clock })
        .import(catalogRequest({ kind: 'fixtures', query: { competitionId: 39, season: 2026 } }, p.now()));
      assert.equal(seeded.importedCount, catalogRows.length);
      p.setTime(T0);
      const F = {};
      for (const [key, id] of Object.entries(ids)) F[key] = await catalog.fixtureByProviderId(id);
      assert.equal(F.P.status, 'postponed');
      const untouched = () => a.query(async (tx) => ({ imports: await tx.footballImport.count(), events: await tx.predictionChangeEvent.count(),
        versions: (await tx.footballFixture.findMany({ where: { id: { in: Object.values(F).map((fixture) => fixture.id) } },
          select: { id: true, dataVersion: true }, orderBy: { id: 'asc' } })).map((row) => [row.id, String(row.dataVersion)]) }));
      const baseline = await untouched();

      const display = { publicDisplay: false }, policy = oddsPolicy(), authority = oddsAuthority(display, policy);
      const clock = { now: () => p.now() };
      const odds = createSyntheticOddsAdapter(clock, { setTime: (value) => p.setTime(value) });
      const store = createMysqlOddsStore(a), otherStore = createMysqlOddsStore(b);
      let boundsOverrides = {}, directCalls = 0;
      const service = createOddsImportService({ adapter: odds.adapter.odds, store, authority, accountId: () => accountId,
        bounds: () => oddsBounds(p.now(), boundsOverrides), clock });
      const slot = () => Math.floor(p.now() / (3 * HOUR)) * 3 * HOUR;
      const importDate = (date) => service.importDate(oddsRequest('prices', slot(), { date, policy, id: oddsHash(`prices:${date}:${p.now()}`) }));
      const importCatalog = (kind) => service.importCatalog(oddsRequest(kind, slot(), { policy, id: oddsHash(`${kind}:${p.now()}`) }));
      const advance = (ms) => p.setTime(p.now() + ms);
      // Current provider book per fixture key; rows are rebuilt with a fresh provider update time on every sweep.
      const book = { A: launchBets(), B: launchBets(), C: launchBets(), M: launchBets(), P: launchBets(), S: launchBets(), E: launchBets() };
      const row = (key, overrides = {}) => rawOddsRow(ids[key] ?? key, overrides.kickoff ?? kickoffs[key],
        { update: offsetTime(p.now() - MINUTE), bets: book[key] ?? launchBets(), ...overrides });
      const sweep = (keys) => { odds.state.rows = keys.map((key) => Array.isArray(key) ? row(...key) : row(key)); };
      const nextKeys = () => ['A', 'B', 'C', ['M', { kickoff: kickoffs.M + 30 * MINUTE }], 'P', [UNKNOWN, { kickoff: kickoffs.A }]];

      const count = async (table) => Number((await a.query((tx) => tx.$queryRawUnsafe(`SELECT COUNT(*) AS n FROM ${table}`)))[0].n);
      const tag = (key) => `fixture:${F[key].id.toLowerCase()}`;
      const generation = async (name) => {
        const found = (await a.query((tx) => tx.$queryRaw`SELECT generation FROM PublicCacheTag WHERE tag = ${name}`))[0];
        return found ? Number(found.generation) : 0;
      };
      const generations = async () => Object.fromEntries(await Promise.all([...['A', 'B', 'C', 'E'].map(async (key) => [key, await generation(tag(key))]),
        ['next', await generation(`date:${NEXT}`)], ['later', await generation(`date:${LATER}`)]]));
      const state = (key) => a.query((tx) => tx.fixtureOddsState.findUnique({ where: { fixtureId: F[key].id } }));
      const prices = async (key) => (await a.query((tx) => tx.$queryRaw`SELECT marketKey, selection, basis, bookmakerExternalId,
        CAST(line AS CHAR) AS line, CAST(priceDecimal AS CHAR) AS price, displayHundredths, CAST(impliedProbability AS CHAR) AS implied,
        CAST(overround AS CHAR) AS overround, method, mappingVersion, snapshotId, basisJson, retrievedAt, providerUpdatedAt, stale
        FROM FixtureOddsPrice WHERE fixtureId = ${F[key].id} ORDER BY marketKey, selection`))
        .map((price) => ({ ...price, displayHundredths: Number(price.displayHundredths), bookmakerExternalId: Number(price.bookmakerExternalId),
          stale: asBool(price.stale), retrievedAt: price.retrievedAt.getTime(), providerUpdatedAt: price.providerUpdatedAt?.getTime() ?? null }));
      const families = async (key, fresh = true) => [...new Set((await prices(key)).filter((price) => !fresh || !price.stale).map((price) => price.marketKey))].sort();

      await t.test('reviewed migration deploys twice, verifies and keeps least-privilege odds grants', async () => {
        for (const command of ['deploy', 'verify']) {
          await execute(process.execPath, ['--conditions=react-server', 'scripts/database.py', command], { env: p.env, windowsHide: true, timeout: 90_000 });
        }
        const tables = await a.query((tx) => tx.$queryRaw`SELECT TABLE_NAME AS name, ENGINE AS engine, TABLE_COLLATION AS collation
          FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME IN ('OddsImportBatch','OddsBetObservation','ProviderOddsSnapshot','FixtureOddsState','FixtureOddsPrice') ORDER BY TABLE_NAME`);
        // Windows servers store table names in lower case (lower_case_table_names = 1).
        assert.deepEqual(tables.map((table) => [table.name.toLowerCase(), table.engine, table.collation]), ['FixtureOddsPrice', 'FixtureOddsState',
          'OddsBetObservation', 'OddsImportBatch', 'ProviderOddsSnapshot'].map((name) => [name.toLowerCase(), 'InnoDB', 'utf8mb4_bin']));
        const triggers = (await p.instance.executeAdmin(`SELECT TRIGGER_NAME FROM information_schema.TRIGGERS
          WHERE TRIGGER_SCHEMA = DATABASE() AND LOWER(EVENT_OBJECT_TABLE) = 'fixtureoddsstate' ORDER BY TRIGGER_NAME`)).stdout.trim().split(/\r?\n/u);
        assert.deepEqual(triggers, ['PublicCache_FixtureOddsState_insert', 'PublicCache_FixtureOddsState_update']);
        const checks = (await p.instance.executeAdmin(`SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
          WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_TYPE = 'CHECK' AND LOWER(TABLE_NAME) LIKE '%odds%'
          ORDER BY CONSTRAINT_NAME`)).stdout.trim().split(/\r?\n/u);
        assert.deepEqual(checks, ['FixtureOddsPrice_basis_check', 'FixtureOddsPrice_market_check', 'FixtureOddsPrice_value_check',
          'FixtureOddsState_shape_check', 'OddsBetObservation_shape_check', 'OddsImportBatch_shape_check', 'ProviderOddsSnapshot_body_check',
          'ProviderOddsSnapshot_identity_check', 'ProviderOddsSnapshot_integrity_check', 'ProviderOddsSnapshot_time_check']);
        // Receipts, bet names and snapshots are append-only; state and prices take column-scoped updates and are never deleted.
        for (const table of ['OddsImportBatch', 'OddsBetObservation', 'ProviderOddsSnapshot']) {
          await assert.rejects(a.query((tx) => tx.$executeRawUnsafe(`UPDATE ${table} SET id = id`)));
          await assert.rejects(a.query((tx) => tx.$executeRawUnsafe(`DELETE FROM ${table}`)));
        }
        for (const table of ['FixtureOddsState', 'FixtureOddsPrice']) await assert.rejects(a.query((tx) => tx.$executeRawUnsafe(`DELETE FROM ${table}`)));
        await assert.rejects(a.query((tx) => tx.$executeRawUnsafe('UPDATE FixtureOddsState SET fixtureId = fixtureId')));
        await assert.rejects(a.query((tx) => tx.$executeRawUnsafe('UPDATE FixtureOddsPrice SET marketKey = marketKey')));
        await assert.rejects(a.query((tx) => tx.$executeRawUnsafe('UPDATE FixtureOddsPrice SET fixtureId = fixtureId')));
      });

      await t.test('bet and bookmaker catalogs keep every observed name once, at enrichment priority', async () => {
        odds.state.bets = launchBetCatalog();
        const first = await importCatalog('bets');
        assert.equal(first.status, 'complete'); assert.equal(first.requestsDispatched, 1); assert.equal(first.error, null);
        assert.equal(await count('OddsBetObservation'), 5);
        const receipt = await store.batch(first.batchId);
        assert.equal(receipt.scopeKey, 'bets'); assert.equal(receipt.accountId, accountId); assert.equal(receipt.contractVersion, policy.contractVersion);
        assert.deepEqual(receipt.catalog, launchBetCatalog().sort((left, right) => left.id - right.id));
        advance(MINUTE);
        const again = await importCatalog('bets');
        assert.notEqual(again.batchId, first.batchId);
        assert.equal(await count('OddsBetObservation'), 5, 'an identical catalog adds a receipt, never a duplicate name');
        advance(MINUTE); odds.state.bets = [...launchBetCatalog().slice(0, 4), { id: 99, name: 'Synthetic special renamed' }];
        await importCatalog('bets');
        assert.equal(await count('OddsBetObservation'), 6, 'a renamed bet is recorded beside the original');
        assert.equal((await store.latestBetCatalog()).get(99), 'Synthetic special renamed');
        const books = await importCatalog('bookmakers');
        assert.equal(books.status, 'complete');
        assert.deepEqual((await store.batch(books.batchId)).catalog, [{ id: ODDS_BOOKMAKER, name: 'Synthetic bookmaker' }]);
        assert.equal(await count('OddsBetObservation'), 6);
        advance(MINUTE); odds.state.bets = launchBetCatalog(); await importCatalog('bets');
        assert.equal((await store.latestBetCatalog()).get(8), 'Both Teams Score');
        assert.ok(odds.network.every((url) => url.search === ''), 'catalog requests carry no selectors');
        assert.ok(odds.reservations.every((reservation) => reservation.priority === 'enrichment'));
        await assert.rejects(store.saveBetObservations(books.batchId, [{ id: 8, name: 'Synthetic bookmaker' }]), denied('invalid-request'));
      });

      let privateBatch, firstRetrieval;
      await t.test('without display rights odds stay private: receipts and append-only snapshots, no public price', async () => {
        const before = await generations();
        sweep(nextKeys());
        const summary = await importDate(NEXT);
        assert.equal(summary.status, 'complete'); assert.equal(summary.requestsDispatched, 1); assert.equal(summary.error, null);
        assert.deepEqual(summary.outcomes, { apply: 3, 'unknown-fixture': 1, 'after-kickoff': 0, 'kickoff-mismatch': 1, 'not-scheduled': 1,
          changed: 3, unchanged: 0, skipped: 0, withdrawn: 0 });
        privateBatch = summary.batchId; firstRetrieval = p.now();
        assert.equal(await catalog.fixtureByProviderId(UNKNOWN), null, 'unknown fixtures are counted, never created');
        assert.equal(await count('ProviderOddsSnapshot'), 15, 'every bet of the documented bookmaker is kept');
        assert.equal(await count('FixtureOddsPrice'), 0);
        for (const key of ['A', 'B', 'C']) {
          const stored = await state(key);
          assert.equal(stored.publicVersion, 0); assert.equal(stored.latestBatchId, summary.batchId); assert.equal(stored.withdrawnAt, null);
          assert.equal(stored.lastRetrievedAt.getTime(), firstRetrieval);
          assert.equal(stored.lastProviderUpdatedAt.getTime(), p.now() - MINUTE);
          assert.equal(stored.policyHash, oddsPolicyHash(policy));
        }
        assert.equal(await state('M'), null); assert.equal(await state('P'), null);
        assert.deepEqual(await generations(), before, 'private imports never invalidate public caches');
        const receipt = await store.batch(summary.batchId);
        assert.equal(receipt.kind, 'prices'); assert.equal(receipt.scopeKey, `date:${NEXT}:bookmaker:${ODDS_BOOKMAKER}`);
        assert.equal(receipt.date, NEXT); assert.equal(receipt.requestsDispatched, 1);
        assert.deepEqual(receipt.fixtures.map((entry) => [entry.externalId, entry.outcome]), [[ids.A, 'apply'], [ids.B, 'apply'], [ids.C, 'apply'],
          [ids.M, 'kickoff-mismatch'], [ids.P, 'not-scheduled'], [UNKNOWN, 'unknown-fixture']]);
        assert.deepEqual(receipt.pages.map((page) => page.requestParameters), [{ bookmaker: '8', date: NEXT, page: '1', timezone: 'Africa/Kampala' }]);
        assert.equal(Object.hasOwn(receipt.pages[0], 'quota'), false, 'quota feedback stays with the limiter');
        const body = (await a.query((tx) => tx.$queryRaw`SELECT CAST(body AS CHAR) AS body FROM OddsImportBatch WHERE id = ${summary.batchId}`))[0].body;
        assert.doesNotMatch(body, /"odd"|"values"|"bookmakers"|1\.85/u, 'receipts never hold prices');
        const chain = await store.snapshotChain(F.A.id, ODDS_BOOKMAKER, 1);
        assert.equal(chain.length, 1); assert.equal(chain[0].previousId, null);
        assert.deepEqual(chain[0].values, [{ label: 'Away', odd: '4.2' }, { label: 'Draw', odd: '3.4' }, { label: 'Home', odd: '1.85' }]);
        assert.equal(chain[0].valuesHash, oddsValuesHash(chain[0].values));
        assert.equal(chain[0].retainUntil, kickoffs.A + 30 * DAY);
        assert.equal(chain[0].retrievedAt, p.now()); assert.equal(chain[0].providerUpdatedAt, p.now() - MINUTE);
        assert.deepEqual([chain[0].bookmakerName, chain[0].betName], ['Synthetic bookmaker', 'Match Winner']);
        assert.equal((await store.snapshotChain(F.A.id, ODDS_BOOKMAKER, 99)).length, 1, 'unmapped bets are retained for later mappings');
        assert.ok(odds.network.slice(-1).every((url) => url.pathname === '/odds' && url.searchParams.get('bookmaker') === '8'));
      });

      await t.test('identical re-imports add nothing; one price change appends one chained snapshot; concurrent applies write once', async () => {
        advance(3 * HOUR); sweep(nextKeys());
        const repeat = await importDate(NEXT);
        assert.equal(repeat.outcomes.unchanged, 3); assert.equal(repeat.outcomes.changed, 0);
        assert.equal(await count('ProviderOddsSnapshot'), 15);
        const reconfirmed = await state('A');
        assert.equal(reconfirmed.lastRetrievedAt.getTime(), p.now()); assert.equal(reconfirmed.latestBatchId, repeat.batchId);
        advance(3 * HOUR); book.A = launchBets({ home: '1.90' }); sweep(nextKeys());
        const changed = await importDate(NEXT);
        assert.equal(changed.outcomes.changed, 1); assert.equal(changed.outcomes.unchanged, 2);
        assert.equal(await count('ProviderOddsSnapshot'), 16);
        const history = await store.snapshotChain(F.A.id, ODDS_BOOKMAKER, 1);
        assert.equal(history.length, 2); assert.equal(history[0].previousId, history[1].id);
        assert.equal(history[0].values.find((value) => value.label === 'Home').odd, '1.9');
        assert.equal(history[0].retrievedAt, p.now()); assert.equal(history[1].retrievedAt, firstRetrieval);
        // A renamed bet is recorded even with identical prices.
        advance(HOUR); book.B = launchBets(); book.B[4] = { ...book.B[4], name: 'Synthetic special (renamed)' }; sweep(nextKeys());
        assert.equal((await importDate(NEXT)).outcomes.changed, 1);
        const renamed = await store.snapshotChain(F.B.id, ODDS_BOOKMAKER, 99);
        assert.deepEqual(renamed.map((snapshot) => snapshot.betName), ['Synthetic special (renamed)', 'Synthetic special']);
        assert.equal(renamed[0].valuesHash, renamed[1].valuesHash);
        // Two replicas apply the same observation at once: the per-fixture state row serializes them. The observation
        // comes from a direct fetch, so it gets the receipt that recorded it (no requests dispatched by the importer).
        advance(HOUR); book.A = launchBets({ home: '1.95' }); sweep(nextKeys());
        const fetched = await odds.adapter.odds.prices({ date: NEXT, bookmakerId: ODDS_BOOKMAKER }, oddsBounds(p.now())); directCalls++;
        const observed = fetched.data.find((item) => item.fixtureId === ids.A);
        const receiptFor = async (row, label, pageRetrievedAt = row.source.retrievedAt) => {
          const { id: _id, ...content } = await store.batch(changed.batchId);
          void _id;
          const next = { ...content, requestId: oddsHash(label), requestsDispatched: 0, receivedAt: pageRetrievedAt,
            pages: [{ ...content.pages[0], retrievedAt: pageRetrievedAt }],
            fixtures: [{ externalId: row.fixtureId, outcome: 'apply', observationHash: evidenceFingerprint(row) }] };
          return store.saveBatch({ id: evidenceFingerprint(next), ...next });
        };
        const input = { batchId: (await receiptFor(observed, 'replica')).id, policy, policyHash: oddsPolicyHash(policy), fixtureId: F.A.id,
          row: observed, publicDisplay: false, catalog: null };
        const snapshotsBefore = await count('ProviderOddsSnapshot');
        // A receipt that never observed these values cannot carry them: the earlier sweep recorded home 1.90, not 1.95.
        await assert.rejects(store.applyFixture({ ...input, batchId: changed.batchId }), denied('invalid-request'));
        // Nor can a row whose retrieval time is not one of the receipt's pages, even when its hash is recorded.
        const pageless = await receiptFor(observed, 'pageless', observed.source.retrievedAt - MINUTE);
        await assert.rejects(store.applyFixture({ ...input, batchId: pageless.id }), denied('invalid-request'));
        assert.equal(await count('ProviderOddsSnapshot'), snapshotsBefore, 'refused applies write nothing');
        const applied = await Promise.all([store.applyFixture(input), otherStore.applyFixture(input)]);
        assert.deepEqual(applied.sort(), ['changed', 'unchanged']);
        assert.equal(await count('ProviderOddsSnapshot'), 18);
        const chainA = await store.snapshotChain(F.A.id, ODDS_BOOKMAKER, 1);
        assert.equal(chainA.length, 3);
        const snapshotBatch = (await a.query((tx) => tx.providerOddsSnapshot.findUnique({ where: { id: chainA[0].id }, select: { batchId: true } }))).batchId;
        assert.equal(snapshotBatch, input.batchId, 'each snapshot links to the receipt that observed its values');
        // An older observation never moves the fixture backwards, even under the receipt that recorded it.
        const older = { ...observed, source: { ...observed.source, retrievedAt: observed.source.retrievedAt - HOUR, providerUpdatedAt: null } };
        assert.equal(await store.applyFixture({ ...input, batchId: (await receiptFor(older, 'older-replica')).id, row: older }), 'skipped');
        // Refusals: another bookmaker, a receipt without this fixture, or a forged receipt body.
        await assert.rejects(store.applyFixture({ ...input, row: { ...observed, bookmakers: [{ ...observed.bookmakers[0], id: 6 }] } }), denied('invalid-request'));
        await assert.rejects(store.applyFixture({ ...input, batchId: privateBatch, row: { ...observed, fixtureId: ids.M } }), denied('invalid-request'));
        assert.equal(await store.applyFixture({ ...input, fixtureId: F.B.id }), 'skipped', 'the catalog identity must match the provider fixture');
        const forged = await store.batch(changed.batchId);
        await assert.rejects(store.saveBatch({ ...forged, status: 'failed' }), denied('invalid-request'));
        await assert.rejects(store.markWithdrawn({ batchId: privateBatch, date: LATER, seenFixtureIds: [] }), denied('invalid-request'));
        assert.equal(await count('FixtureOddsPrice'), 0);
      });

      await t.test('display rights publish complete groups only, with exact de-margined probabilities; triggers fire once per public change', async () => {
        display.publicDisplay = true;
        advance(HOUR);
        book.A = launchBets();
        book.B = launchBets({ btts: [{ value: 'Yes', odd: '1.80' }] });
        book.C = launchBets({ matchWinnerName: 'Fulltime Result', overUnder: [{ value: 'Over 1.5', odd: '1.30' }, { value: 'Under 1.5', odd: '3.50' }] });
        sweep(nextKeys());
        const before = await generations(), invalidations = await count('PublicCacheInvalidation');
        const published = await importDate(NEXT);
        assert.equal(published.outcomes.changed, 3);
        assert.deepEqual(await families('A'), ['both-teams-to-score', 'double-chance', 'match-result', 'total-goals']);
        assert.deepEqual(await families('B'), ['double-chance', 'match-result', 'total-goals'], 'an incomplete group publishes nothing');
        assert.deepEqual(await families('C'), ['both-teams-to-score', 'double-chance'], 'a renamed bet or a missing line publishes nothing');
        const rows = await prices('A'), by = (market, selection) => rows.find((price) => price.marketKey === market && price.selection === selection);
        const heads = Object.fromEntries(await Promise.all([1, 5, 8, 12].map(async (bet) => [bet, (await store.snapshotChain(F.A.id, ODDS_BOOKMAKER, bet))[0]])));
        const expectations = [
          ['match-result', ['home-win', 'draw', 'away-win'], ['1.85', '3.4', '4.2'], 1, 1, null],
          ['double-chance', ['home-or-draw', 'away-or-draw', 'home-or-away'], ['1.25', '1.8', '1.3'], 2, 12, null],
          ['total-goals', ['over-2.5', 'under-2.5'], ['1.9', '1.95'], 1, 5, '2.50'],
          ['both-teams-to-score', ['yes', 'no'], ['1.8', '2'], 1, 8, null],
        ];
        for (const [market, selections, quoted, coverage, bet, line] of expectations) {
          const expected = deMargin(quoted.map(parseDecimalOdds), coverage);
          let total = 0n;
          selections.forEach((selection, index) => {
            const price = by(market, selection), decimal = parseDecimalOdds(quoted[index]);
            assert.equal(price.price, `${(Number(decimal.scaled) / 10_000).toFixed(4)}`);
            assert.equal(price.displayHundredths, Number((decimal.scaled + 50n) / 100n));
            assert.equal(price.implied, expected.probabilities[index]); assert.equal(price.overround, expected.overround);
            assert.equal(price.line, line); assert.equal(price.basis, 'bookmaker'); assert.equal(price.bookmakerExternalId, ODDS_BOOKMAKER);
            assert.equal(price.method, 'proportional-v1'); assert.equal(price.mappingVersion, 'launch-odds-v1'); assert.equal(price.basisJson, null);
            assert.equal(price.snapshotId, heads[bet].id); assert.equal(price.retrievedAt, heads[bet].retrievedAt); assert.equal(price.stale, false);
            total += scaled(price.implied);
          });
          // Exact 12-place rounding: each group sums to its coverage within one unit per selection.
          const target = BigInt(coverage) * 10n ** 12n, drift = total > target ? total - target : target - total;
          assert.ok(drift <= BigInt(selections.length), `${market} sums to ${total}`);
        }
        for (const key of ['A', 'B', 'C']) assert.equal((await state(key)).publicVersion, 1);
        const after = await generations();
        for (const key of ['A', 'B', 'C']) assert.equal(after[key], before[key] + 1, `${key} invalidates once`);
        assert.equal(after.next, before.next + 3, 'the date cohort invalidates once per changed fixture');
        assert.equal(await count('PublicCacheInvalidation'), invalidations + 6);

        // Reconfirming identical prices changes no public row, version or cache generation.
        const snapshot = { A: await prices('A'), B: await prices('B'), C: await prices('C') }, snapshots = await count('ProviderOddsSnapshot');
        advance(HOUR); sweep(nextKeys());
        const quiet = await importDate(NEXT);
        assert.equal(quiet.outcomes.unchanged, 3);
        assert.deepEqual(await generations(), after);
        assert.deepEqual({ A: await prices('A'), B: await prices('B'), C: await prices('C') }, snapshot);
        assert.equal(await count('ProviderOddsSnapshot'), snapshots);
        assert.equal((await state('A')).lastRetrievedAt.getTime(), p.now(), 'staleness follows the last reconfirmation');

        // One family moves: only that fixture and its date invalidate, and only that family's rows change.
        advance(HOUR); book.A = launchBets({ yes: '1.75' }); sweep(nextKeys());
        assert.equal((await importDate(NEXT)).outcomes.changed, 1);
        const moved = await generations();
        assert.deepEqual([moved.A, moved.B, moved.C, moved.next], [after.A + 1, after.B, after.C, after.next + 1]);
        assert.equal((await state('A')).publicVersion, 2);
        const movedRows = await prices('A');
        assert.deepEqual(movedRows.filter((price) => price.marketKey !== 'both-teams-to-score'),
          snapshot.A.filter((price) => price.marketKey !== 'both-teams-to-score'));
        assert.equal(movedRows.find((price) => price.selection === 'yes').price, '1.7500');

        // Feed and detail read the same rule: exact family and selection, fresh rows only, nothing borrowed.
        const picks = [{ family: 'match-result', selection: 'home-win' }, { family: 'total-goals', selection: 'under-2.5' },
          { family: 'both-teams-to-score', selection: 'no' }];
        const readPrices = (key, enabled = true) => a.query((tx) => storedFixturePrices(tx, F[key].id, picks, enabled));
        assert.deepEqual((await readPrices('C')).map((price) => [price.family, price.selection, price.price]), [['both-teams-to-score', 'no', '2.00']]);
        assert.deepEqual((await readPrices('A')).map((price) => price.price), ['1.85', '1.95', '2.00']);
        assert.deepEqual(await readPrices('A', false), [], 'nothing is read while provider odds are publicly off');
        const groups = await a.query((tx) => storedFixtureOddsGroups(tx, F.B.id, true));
        assert.deepEqual(groups.map((group) => [group.label, group.family, group.selections.length]),
          [['market-implied', 'match-result', 3], ['market-implied', 'double-chance', 3], ['market-implied', 'total-goals', 2]]);

        // A catalog that no longer names the bet exactly withholds that family everywhere; prices never come back by borrowing.
        advance(MINUTE); odds.state.bets = launchBetCatalog().map((entry) => entry.id === 8 ? { id: 8, name: 'Both Teams To Score' } : entry);
        await importCatalog('bets');
        advance(HOUR); sweep(nextKeys());
        await importDate(NEXT);
        assert.deepEqual(await families('A'), ['double-chance', 'match-result', 'total-goals']);
        assert.deepEqual(await families('C'), ['double-chance']);
        assert.ok((await prices('A')).filter((price) => price.marketKey === 'both-teams-to-score').every((price) => price.stale));
        assert.deepEqual(await readPrices('C'), []);
        advance(MINUTE); odds.state.bets = launchBetCatalog(); await importCatalog('bets');
        advance(HOUR); sweep(nextKeys());
        await importDate(NEXT);
        assert.deepEqual(await families('A'), ['both-teams-to-score', 'double-chance', 'match-result', 'total-goals']);
      });

      await t.test('partial and failed sweeps never withdraw; a complete sweep withdraws absent fixtures and stales their prices', async () => {
        const freshB = (await prices('B')).filter((price) => !price.stale).length;
        assert.equal(freshB, 8);
        advance(HOUR);
        const filler = Array.from({ length: 8 }, (_, index) => [59100 + index, { kickoff: kickoffs.B }]);
        sweep(['A', 'C', ...filler, 'B']);
        boundsOverrides = { maxPages: 1 };
        const partial = await importDate(NEXT);
        boundsOverrides = {};
        assert.equal(partial.status, 'partial'); assert.equal(partial.outcomes.withdrawn, 0);
        assert.equal(partial.outcomes.apply, 2); assert.equal(partial.outcomes['unknown-fixture'], 8);
        assert.equal((await state('B')).withdrawnAt, null);
        assert.equal((await prices('B')).filter((price) => !price.stale).length, freshB, 'absence from an incomplete response proves nothing');
        advance(HOUR);
        const batches = await count('OddsImportBatch');
        odds.state.respond = (url) => oddsResponse(url, [], { status: 503 });
        const failed = await importDate(NEXT);
        odds.state.respond = null;
        assert.equal(failed.status, 'failed'); assert.notEqual(failed.error, null); assert.equal(failed.outcomes.withdrawn, 0);
        assert.equal(await count('OddsImportBatch'), batches + 1, 'a failed sweep still leaves its receipt');
        assert.equal((await state('B')).withdrawnAt, null);

        advance(HOUR); sweep(['A', 'C', ['M', { kickoff: kickoffs.M + 30 * MINUTE }], 'P']);
        const before = await generations(), versionB = (await state('B')).publicVersion;
        const swept = await importDate(NEXT);
        assert.equal(swept.status, 'complete'); assert.equal(swept.outcomes.withdrawn, 1);
        const withdrawn = await state('B');
        assert.equal(withdrawn.withdrawnAt.getTime(), p.now()); assert.equal(withdrawn.latestBatchId, swept.batchId);
        assert.equal(withdrawn.publicVersion, versionB + 1);
        assert.ok((await prices('B')).every((price) => price.stale));
        assert.equal((await generations()).B, before.B + 1);
        assert.equal((await state('A')).withdrawnAt, null); assert.equal((await state('C')).withdrawnAt, null);
        advance(HOUR); sweep(nextKeys());
        const back = await importDate(NEXT);
        assert.equal(back.outcomes.withdrawn, 0);
        assert.equal((await state('B')).withdrawnAt, null);
        assert.equal((await prices('B')).filter((price) => !price.stale).length, 8, 'a reconfirmed fixture is fresh again');
      });

      await t.test('write-time staleness stales unconfirmed prices and freezes the last valid closing price', async () => {
        // A, B and C were last reconfirmed more than 12 hours before their kickoffs; after kickoff they stay stale.
        p.setTime(Date.parse('2026-10-14T00:00:00.000Z'));
        assert.equal(await service.expire(policy.freshnessMs, 500), 3);
        for (const key of ['A', 'B', 'C']) assert.ok((await prices(key)).every((price) => price.stale));
        assert.equal(await service.expire(policy.freshnessMs, 500), 0, 'expiry is idempotent');
        sweep(['S', 'E']);
        const later = await importDate(LATER);
        assert.equal(later.outcomes['after-kickoff'], 1); assert.equal(later.outcomes.apply, 1); assert.equal(later.outcomes.changed, 1);
        assert.equal(await state('S'), null, 'a started fixture never receives a price');
        assert.equal((await prices('E')).length, 10);
        const imported = p.now(), versionE = (await state('E')).publicVersion;
        p.setTime(imported + 12 * HOUR - 1);
        assert.equal(await service.expire(policy.freshnessMs, 500), 0);
        p.setTime(imported + 12 * HOUR + 1);
        const before = await generations();
        assert.equal(await service.expire(policy.freshnessMs, 500), 1);
        assert.ok((await prices('E')).every((price) => price.stale));
        assert.equal((await state('E')).publicVersion, versionE + 1);
        assert.deepEqual([(await generations()).E, (await generations()).later], [before.E + 1, before.later + 1]);
        advance(30 * MINUTE); sweep(['S', 'E']);
        assert.equal((await importDate(LATER)).outcomes.changed, 1);
        assert.ok((await prices('E')).every((price) => !price.stale));
        // After kickoff the comparison point stays at kickoff: the reconfirmed closing price is frozen, not expired.
        p.setTime(Date.parse('2026-10-15T12:00:00.000Z'));
        const closing = await prices('E'), closingVersion = (await state('E')).publicVersion;
        assert.equal(await service.expire(policy.freshnessMs, 500), 0);
        book.E = launchBets({ home: '1.40' }); sweep(['S', 'E']);
        const afterKickoff = await importDate(LATER);
        assert.equal(afterKickoff.outcomes['after-kickoff'], 2); assert.equal(afterKickoff.outcomes.changed, 0);
        assert.deepEqual(await prices('E'), closing);
        assert.equal((await state('E')).publicVersion, closingVersion);
      });

      await t.test('withdrawn display rights stale every fresh price, closing prices included, without a provider call', async () => {
        const fresh = async () => Number((await a.query((tx) => tx.$queryRaw`SELECT COUNT(*) AS n FROM FixtureOddsPrice WHERE stale = FALSE`))[0].n);
        assert.ok(p.now() > kickoffs.E && await fresh() > 0, 'E keeps its frozen closing price after kickoff');
        const calls = odds.network.length, versionE = (await state('E')).publicVersion, before = await generations();
        display.publicDisplay = false;
        assert.equal(await service.expire(policy.freshnessMs, 500), 1, 'one fixture had fresh prices');
        assert.equal(await fresh(), 0, 'no fresh public price remains once the rights are withdrawn');
        assert.equal((await state('E')).publicVersion, versionE + 1);
        const after = await generations();
        assert.deepEqual([after.E, after.later], [before.E + 1, before.later + 1], 'the fixture and its date invalidate once');
        assert.equal(await service.expire(policy.freshnessMs, 500), 0, 'the rights sweep is idempotent');
        assert.equal(odds.network.length, calls, 'withdrawing rights makes no provider call');
        // Restoring the rights brings nothing back by itself; only a new pre-match observation can publish again.
        display.publicDisplay = true;
        assert.equal(await service.expire(policy.freshnessMs, 500), 0);
        assert.equal(await fresh(), 0);
      });

      await t.test('native CHECK constraints and the composite snapshot key refuse malformed odds rows', async () => {
        const sql = (statement) => p.instance.executeAdmin(statement);
        const head = (await store.snapshotChain(F.E.id, ODDS_BOOKMAKER, 1))[0].id, other = (await store.snapshotChain(F.A.id, ODDS_BOOKMAKER, 1))[0].id;
        const where = `WHERE fixtureId = '${F.E.id}' AND marketKey = 'match-result' AND selection = 'home-win'`;
        const before = await prices('E'), stateBefore = await state('E');
        await assert.rejects(sql(`UPDATE ProviderOddsSnapshot SET integrity = REPEAT('a', 64) WHERE id = '${head}'`), violates(/ProviderOddsSnapshot_integrity_check/u));
        await assert.rejects(sql(`UPDATE ProviderOddsSnapshot SET selectionCount = selectionCount + 1 WHERE id = '${head}'`), violates(/ProviderOddsSnapshot_body_check/u));
        await assert.rejects(sql(`UPDATE ProviderOddsSnapshot SET retainUntil = retrievedAt WHERE id = '${head}'`), violates(/ProviderOddsSnapshot_(time|body)_check/u));
        await assert.rejects(sql(`UPDATE ProviderOddsSnapshot SET providerUpdatedAt = DATE_ADD(retrievedAt, INTERVAL 1 SECOND) WHERE id = '${head}'`),
          violates(/ProviderOddsSnapshot_(time|body)_check/u));
        await assert.rejects(sql(`UPDATE ProviderOddsSnapshot SET body = JSON_REMOVE(body, '$.values'), integrity = SHA2(CAST(body AS CHAR), 256)
          WHERE id = '${head}'`), violates(/ProviderOddsSnapshot_body_check/u));
        await assert.rejects(sql(`UPDATE FixtureOddsPrice SET displayHundredths = displayHundredths + 1 ${where}`), violates(/FixtureOddsPrice_value_check/u));
        await assert.rejects(sql(`UPDATE FixtureOddsPrice SET priceDecimal = 1.0000, displayHundredths = 100 ${where}`), violates(/FixtureOddsPrice_value_check/u));
        await assert.rejects(sql(`UPDATE FixtureOddsPrice SET impliedProbability = 1 ${where}`), violates(/FixtureOddsPrice_value_check/u));
        await assert.rejects(sql(`UPDATE FixtureOddsPrice SET marketKey = 'corners' ${where}`), violates(/FixtureOddsPrice_market_check/u));
        await assert.rejects(sql(`UPDATE FixtureOddsPrice SET line = 3.50 WHERE fixtureId = '${F.E.id}' AND marketKey = 'total-goals' AND selection = 'over-2.5'`),
          violates(/FixtureOddsPrice_market_check/u));
        await assert.rejects(sql(`UPDATE FixtureOddsPrice SET snapshotId = NULL ${where}`), violates(/FixtureOddsPrice_basis_check/u));
        await assert.rejects(sql(`UPDATE FixtureOddsPrice SET basis = 'median' ${where}`), violates(/FixtureOddsPrice_basis_check/u));
        await assert.rejects(sql(`UPDATE FixtureOddsPrice SET snapshotId = '${other}' ${where}`), violates(/foreign key constraint fails/iu));
        await assert.rejects(sql(`UPDATE FixtureOddsState SET lastProviderUpdatedAt = DATE_ADD(lastRetrievedAt, INTERVAL 1 SECOND) WHERE fixtureId = '${F.E.id}'`),
          violates(/FixtureOddsState_shape_check/u));
        await assert.rejects(sql(`UPDATE OddsImportBatch SET status = 'failed' WHERE id = '${privateBatch}'`), violates(/OddsImportBatch_shape_check/u));
        await assert.rejects(sql(`UPDATE OddsImportBatch SET integrity = REPEAT('a', 64) WHERE id = '${privateBatch}'`), violates(/OddsImportBatch_shape_check/u));
        await assert.rejects(sql(`UPDATE OddsBetObservation SET name = CONCAT(' ', name) WHERE betExternalId = 1`), violates(/OddsBetObservation_shape_check/u));
        assert.deepEqual(await prices('E'), before); assert.deepEqual(await state('E'), stateBefore);
      });

      await t.test('odds never touch catalog versions, imports, change events or the network', async () => {
        assert.deepEqual(await untouched(), baseline);
        assert.deepEqual(stray, []);
        assert.ok(odds.network.every((url) => url.pathname.startsWith('/odds')));
        assert.equal(odds.reservations.length, odds.network.length, 'every dispatched request was reserved by the limiter');
        assert.ok(odds.reservations.every((reservation) => reservation.priority === 'enrichment'));
        const dispatched = Number((await a.query((tx) => tx.$queryRaw`SELECT COALESCE(SUM(requestsDispatched), 0) AS total FROM OddsImportBatch`))[0].total);
        assert.equal(dispatched, odds.network.length - directCalls, 'receipts attribute every request the importer dispatched');
      });
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
