import assert from 'node:assert/strict';
import { execFile } from './helpers/command-runtime.mjs';
import test from 'node:test';
import { promisify } from 'node:util';
import { getReportingDate } from '../src/domain/calendar.ts';
import { performanceResponseSchema } from '../src/domain/performance.ts';
import { createMysqlOddsStore } from '../src/server/odds/odds-mysql-store.ts';
import { createOddsImportService } from '../src/server/odds/odds-service.ts';
import { createPerformanceService } from '../src/server/performance/performance-service.ts';
import { createScheduleLifecycleService } from '../src/server/predictions/lifecycle-service.ts';
import { parseLifecycleInput } from '../src/server/predictions/lifecycle-input.ts';
import { predictionQuoteFromRow } from '../src/server/predictions/prediction-quote-store.ts';
import { RevisionPublicationError } from '../src/server/predictions/publication-contract.ts';
import { createRevisionPublicationService } from '../src/server/predictions/publication-service.ts';
import { createMysqlResultSyncStore } from '../src/server/results/result-sync-mysql-store.ts';
import { createMarketSettlementService } from '../src/server/settlement/settlement-service.ts';
import { lifecycleAuthority, lifecycleInput, lifecyclePolicy } from './helpers/lifecycle-fixtures.mjs';
import { createSyntheticOddsAdapter, launchBetCatalog, launchBets, oddsAuthority, oddsBounds, oddsHash, oddsPolicy, oddsRequest,
  offsetTime, rawOddsRow } from './helpers/odds-fixtures.mjs';
import { PUBLICATION_NOW, publicationAuthority, publicationPolicy } from './helpers/publication-fixtures.mjs';
import { resultHash } from './helpers/result-sync-fixtures.mjs';
import { withPredictionPipeline } from './prediction-pipeline.mjs';

const execute = promisify(execFile);
const period = 'from=2026-10-09&to=2026-10-12';
const cell = (report, family = 'match-result', source = 'combined') => report.cells.find((c) => c.family === family && c.source === source && c.horizon === null);
const launchPrice = { 'match-result': { 'home-win': 185, draw: 340, 'away-win': 420 }, 'double-chance': { 'home-or-draw': 125, 'home-or-away': 130, 'away-or-draw': 180 },
  'total-goals': { 'over-2.5': 190, 'under-2.5': 195 } };
const sqlTime = (at) => new Date(at).toISOString().slice(0, 23).replace('T', ' ');

// Synthetic bookmaker prices, display rights, forecasts and results only; no provider, model or payment call is made.
test('original public prediction quotes on owned genuine MySQL', { timeout: 300_000 }, async (t) => {
  await withPredictionPipeline(t, async (p) => {
    const policy = oddsPolicy(), clock = { now: () => p.now() }, accountId = oddsHash('prediction-quotes-account');
    const quotes = (verify = () => true) => ({ verify, freshnessMs: policy.freshnessMs });
    const publisher = (options = {}) => createRevisionPublicationService({ database: p.a, queue: p.queue, policy: publicationPolicy(),
      authority: publicationAuthority(options.authority), ...(options.quotes ? { quotes: options.quotes } : {}) });
    const stored = (revisionId) => p.a.query((tx) => tx.$queryRaw`SELECT *, integrity = SHA2(CAST(body AS CHAR), 256) AS validIntegrity
      FROM PredictionQuote WHERE revisionId = ${revisionId} ORDER BY family`);
    const quoteCount = (fixtureId) => p.a.query((tx) => tx.predictionQuote.count({ where: { fixtureId } }));
    const setCount = (fixtureId) => p.a.query((tx) => tx.predictionSet.count({ where: { fixtureId } }));
    const states = new Map();
    for (const id of [3000, 3001, 3002, 3003]) states.set(id, await p.setup(id));

    // Fresh public prices before publication: complete launch groups for 3000-3001, no BTTS for 3002, nothing for 3003.
    await p.a.query((tx) => tx.apiQuotaAccount.create({ data: { id: accountId } }));
    const odds = createSyntheticOddsAdapter(clock, { setTime: (value) => p.setTime(value) });
    const importer = createOddsImportService({ adapter: odds.adapter.odds, store: createMysqlOddsStore(p.a),
      authority: oddsAuthority({ publicDisplay: true }, policy), accountId: () => accountId, bounds: () => oddsBounds(p.now()), clock });
    const kickoff = states.get(3000).fixture.kickoff, slot = Math.floor(PUBLICATION_NOW / 10_800_000) * 10_800_000;
    const importPrices = async (name, bets3002) => {
      odds.state.rows = [rawOddsRow(3000, kickoff, { update: offsetTime(p.now() - 60_000) }), rawOddsRow(3001, kickoff, { update: offsetTime(p.now() - 60_000) }),
        rawOddsRow(3002, kickoff, { update: offsetTime(p.now() - 60_000), bets: bets3002 })];
      const summary = await importer.importDate(oddsRequest('prices', slot, { date: getReportingDate(kickoff), policy, id: oddsHash(name) }));
      assert.equal(summary.status, 'complete');
    };
    p.setTime(PUBLICATION_NOW - 2000);
    odds.state.bets = launchBetCatalog();
    assert.equal((await importer.importCatalog(oddsRequest('bets', slot, { policy, id: oddsHash('prediction-quotes:bets') }))).status, 'complete');
    await importPrices('prediction-quotes:prices', launchBets().filter((bet) => bet.id !== 8));
    p.setTime(PUBLICATION_NOW);

    async function publish(id, service) {
      const state = states.get(id), receipt = await service.publish(state.input, state.lease);
      assert.equal(receipt.refresh.outcome, 'published'); state.revision = receipt.revision;
      await p.queue.acknowledge(state.lease); return state;
    }

    await t.test('the migration deploys one InnoDB utf8mb4_bin append-only table without drift', async () => {
      await execute(process.execPath, ['--conditions=react-server', 'scripts/database.py', 'verify'], { env: p.env, windowsHide: true, timeout: 60_000 });
      const [table] = await p.a.query((tx) => tx.$queryRaw`SELECT ENGINE, TABLE_COLLATION FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'PredictionQuote'`);
      assert.equal(table.ENGINE, 'InnoDB'); assert.equal(table.TABLE_COLLATION, 'utf8mb4_bin');
      const checks = (await p.instance.executeAdmin(`SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE()
        AND CONSTRAINT_TYPE = 'CHECK' AND LOWER(TABLE_NAME) = 'predictionquote' ORDER BY CONSTRAINT_NAME`)).stdout.trim().split(/\r?\n/u);
      assert.deepEqual(checks, ['PredictionQuote_body_check', 'PredictionQuote_identity_check', 'PredictionQuote_state_check']);
      const triggers = (await p.instance.executeAdmin(`SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE()
        AND LOWER(EVENT_OBJECT_TABLE) = 'predictionquote' ORDER BY TRIGGER_NAME`)).stdout.trim().split(/\r?\n/u);
      assert.deepEqual(triggers, ['PredictionQuote_no_delete', 'PredictionQuote_no_update']);
      const references = (await p.instance.executeAdmin(`SELECT DISTINCT REFERENCED_TABLE_NAME FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) = 'predictionquote' AND REFERENCED_TABLE_NAME IS NOT NULL`)).stdout.trim().split(/\r?\n/u);
      assert.deepEqual(references.map((name) => name.toLowerCase()), ['predictionset'], 'no odds snapshot foreign key');
    });

    await t.test('capture is off without the option and when the rights proof is not true', async () => {
      const plain = await publish(3000, p.publisher);
      assert.equal(await quoteCount(plain.fixture.id), 0);
      const denied = await publish(3001, publisher({ quotes: quotes(() => false) }));
      assert.equal(await quoteCount(denied.fixture.id), 0);
      assert.ok(await p.a.query((tx) => tx.fixtureOddsPrice.count({ where: { fixtureId: denied.fixture.id, stale: false } })) > 0, 'prices existed');
    });

    await t.test('a failed final re-check rolls the capture back with the revision', async () => {
      let checks = 0;
      const state = states.get(3002), rejected = publisher({ quotes: quotes(), authority: { verifyCandidate: () => ++checks < 3 } });
      await assert.rejects(rejected.publish(state.input, state.lease), (error) => error instanceof RevisionPublicationError && error.reason === 'unauthorized');
      assert.equal(checks, 3);
      assert.equal(await setCount(state.fixture.id), 0); assert.equal(await quoteCount(state.fixture.id), 0);
    });

    await t.test('revoked capture rights roll back the quote and forecast together', async () => {
      let checks = 0; const state = states.get(3002);
      await assert.rejects(publisher({ quotes: quotes(() => ++checks === 1) }).publish(state.input,state.lease),
        error => error instanceof RevisionPublicationError && error.reason === 'eligibility-expired');
      assert.equal(checks,2); assert.equal(await setCount(state.fixture.id),0); assert.equal(await quoteCount(state.fixture.id),0);
    });
    let captured;
    await t.test('publication records one quote per available family from the exact fresh public price', async () => {
      const state = await publish(3002, publisher({ quotes: quotes() }));
      const rows = await stored(state.revision.id); captured = rows.map(predictionQuoteFromRow);
      assert.deepEqual(captured.map((quote) => quote.family), ['both-teams-to-score', 'double-chance', 'match-result', 'total-goals']);
      const prices = await p.a.query((tx) => tx.fixtureOddsPrice.findMany({ where: { fixtureId: state.fixture.id, stale: false } }));
      for (const quote of captured) {
        const selection = state.revision.candidate.markets[quote.family].market.selection;
        assert.equal(quote.selection, selection); assert.equal(quote.recordedAt, state.revision.publishedAt);
        assert.equal(quote.revisionId, state.revision.id); assert.equal(quote.cycleId, state.cycle.id); assert.equal(quote.fixtureId, state.fixture.id);
        if (quote.family === 'both-teams-to-score') {
          assert.equal(quote.state, 'unavailable'); assert.equal(quote.reason, 'no-public-price'); assert.equal(quote.price, null); continue;
        }
        const price = prices.find((row) => row.marketKey === quote.family && row.selection === selection);
        assert.equal(quote.state, 'quoted', `${quote.family}: ${quote.reason}`); assert.equal(quote.price.hundredths, launchPrice[quote.family][selection]);
        assert.equal(quote.price.hundredths, price.displayHundredths); assert.equal(quote.price.snapshotId, price.snapshotId);
        assert.equal(quote.price.retrievedAt, price.retrievedAt.getTime()); assert.equal(quote.price.basis, 'bookmaker');
      }
      const empty = await publish(3003, publisher({ quotes: quotes() }));
      const missing = (await stored(empty.revision.id)).map(predictionQuoteFromRow);
      assert.equal(missing.length, 4); assert.ok(missing.every((quote) => quote.state === 'unavailable' && quote.reason === 'no-public-price'));
    });

    await t.test('later odds changes never rewrite a captured quote', async () => {
      const state = states.get(3002), before = await stored(state.revision.id);
      p.setTime(PUBLICATION_NOW + 500);
      await importPrices('prediction-quotes:prices-changed', launchBets({ home: '1.95', draw: '3.60', away: '4.50', homeDraw: '1.20', homeAway: '1.35',
        drawAway: '1.90', over: '2.10', under: '1.75' }).filter((bet) => bet.id !== 8));
      const selection = state.revision.candidate.markets['match-result'].market.selection;
      const current = await p.a.query((tx) => tx.fixtureOddsPrice.findUniqueOrThrow({ where: { fixtureId_marketKey_selection: {
        fixtureId: state.fixture.id, marketKey: 'match-result', selection } } }));
      assert.notEqual(current.displayHundredths, launchPrice['match-result'][selection], 'the public price changed');
      assert.deepEqual((await stored(state.revision.id)).map((row) => [row.family, row.displayHundredths, row.integrity]),
        before.map((row) => [row.family, row.displayHundredths, row.integrity]));
      p.setTime(PUBLICATION_NOW);
    });

    await t.test('triggers refuse UPDATE and DELETE and CHECKs refuse inconsistent rows, even for the administrator', async () => {
      const revisionId = states.get(3002).revision.id;
      await assert.rejects(p.instance.executeAdmin(`UPDATE PredictionQuote SET state = state WHERE revisionId = '${revisionId}'`), /append-only/u);
      await assert.rejects(p.instance.executeAdmin(`DELETE FROM PredictionQuote WHERE revisionId = '${revisionId}'`), /append-only/u);
      await assert.rejects(p.a.query((tx) => tx.$executeRawUnsafe(`DELETE FROM PredictionQuote WHERE revisionId = '${revisionId}'`)));
      // The first statement of each pair is a consistent quoted row (rolled back); each refused variant breaks one rule.
      const plain = states.get(3000), at = plain.revision.publishedAt, selection = plain.revision.candidate.markets['match-result'].market.selection;
      const insert = ({ state, reason = 'NULL', snapshot = 'NULL', hundredths = 'NULL', quoted = 'NULL' }) => `SET @b = JSON_OBJECT('version', 1,
        'revisionId', '${plain.revision.id}', 'cycleId', '${plain.cycle.id}', 'fixtureId', '${plain.fixture.id}', 'family', 'match-result',
        'selection', '${selection}', 'state', '${state}', 'recordedAt', ${at});
        INSERT INTO PredictionQuote (revisionId, cycleId, fixtureId, family, selection, state, reason, snapshotId, displayHundredths, quotedAt, recordedAt, integrity, body)
        VALUES ('${plain.revision.id}', '${plain.cycle.id}', '${plain.fixture.id}', 'match-result', '${selection}', '${state}', ${reason}, ${snapshot},
          ${hundredths}, ${quoted}, '${sqlTime(at)}', SHA2(CAST(@b AS CHAR), 256), @b);`;
      const valid = { state: 'quoted', snapshot: `'${'a'.repeat(64)}'`, hundredths: 235, quoted: `'${sqlTime(at - 1000)}'` };
      await p.instance.executeAdmin(`START TRANSACTION; ${insert(valid)} ROLLBACK;`);
      const refused = (error) => /PredictionQuote_state_check/u.test(`${error.message}${error.stderr ?? ''}`);
      await assert.rejects(p.instance.executeAdmin(insert({ ...valid, snapshot: 'NULL' })), refused);
      await assert.rejects(p.instance.executeAdmin(insert({ state: 'unavailable', reason: "'no-public-price'", hundredths: 235 })), refused);
      await assert.rejects(p.instance.executeAdmin(insert({ ...valid, quoted: `'${sqlTime(at + 1000)}'` })), refused);
      assert.equal(await quoteCount(plain.fixture.id), 0);
    });

    await t.test('locked, settled cohorts report exact returns only with quotes enabled; streaks match either way', async () => {
      for (const id of [3000, 3001, 3002, 3003]) { const state = states.get(id); p.setTime(state.cycle.cutoffAt); await p.first.close(p.target(state)); }
      const lifecycle = createScheduleLifecycleService({ database: p.a, cutoff: p.first, policy: lifecyclePolicy(), authority: lifecycleAuthority() });
      const results = createMysqlResultSyncStore({ database: p.a, accountId, lifecycle });
      const settlement = createMarketSettlementService({ database: p.a, queue: p.queue });
      let number = 0;
      for (const id of [3000, 3001, 3002, 3003]) {
        const state = states.get(id); number++;
        p.setTime(Date.parse('2026-10-13T12:00:00Z') + number * 1000);
        const observation = parseLifecycleInput(lifecycleInput(state, p.now(), { status: 'FT', raw: { goals: { home: 2, away: 1 }, score: { fulltime: { home: 2, away: 1 } } } }));
        const lease = await results.acquire(resultHash(`prediction-quotes-owner:${number}`), 30_000); assert.ok(lease);
        const batch = { id: resultHash(`prediction-quotes-result:${number}`), accountId, policyHash: resultHash('prediction-quotes-result-policy'), receivedAt: p.now(),
          channel: 'ids', date: null, requestedIds: [Number(state.fixture.externalId)], observations: [observation], error: null, requestsDispatched: 1 };
        try { await results.save(lease, batch); await results.apply(lease, batch); } finally { await results.release(lease); }
        await settlement.settleFixture(state.fixture.id);
      }
      const read = (enabled) => createPerformanceService({ database: p.a, competitionIds: [39], clock: { now: () => p.now() }, quoteBinding: enabled ? {bookmakerId:8,maximumAgeMs:policy.freshnessMs,verifyPublicDisplay:()=>true}:null })
        .query(new URLSearchParams(period)).then((value) => performanceResponseSchema.parse(value));
      const enabled = await read(true), disabled = await read(false), returns = cell(enabled).returns;
      assert.equal(cell(enabled).metrics.denominator, 4); assert.equal(returns.settled, 4);
      assert.equal(returns.returnsSampleCount, 1); assert.equal(returns.excludedQuoteCount, 3);
      // 2-1 in regulation: the single priced prediction (3002) wins exactly when its locked selection is home-win.
      const selection = states.get(3002).revision.candidate.markets['match-result'].market.selection, won = selection === 'home-win';
      const hundredths = launchPrice['match-result'][selection];
      assert.equal(returns.stakeUnits, 1);
      assert.equal(returns.returnUnits, won ? hundredths / 100 : 0); assert.equal(returns.profitUnits, (won ? hundredths - 100 : -100) / 100);
      assert.equal(returns.roi, (won ? hundredths - 100 : -100) / 100); assert.equal(returns.meanQuotedOdds, hundredths / 100);
      assert.equal(returns.settled, cell(enabled).metrics.denominator);
      const btts = cell(enabled, 'both-teams-to-score').returns;
      assert.equal(btts.returnsSampleCount, 0); assert.equal(btts.excludedQuoteCount, btts.settled); assert.equal(btts.roi, null);
      for (const family of ['match-result', 'double-chance', 'total-goals', 'both-teams-to-score']) {
        const off = cell(disabled, family).returns, on = cell(enabled, family).returns;
        assert.equal(off.returnsSampleCount, 0); assert.equal(off.roi, null); assert.equal(off.excludedQuoteCount, off.settled);
        assert.equal(off.longestLosingStreak, on.longestLosingStreak); assert.equal(off.currentLosingStreak, on.currentLosingStreak);
        assert.equal(off.settled, on.settled);
      }
      assert.notEqual(enabled.freshness.snapshotKey, disabled.freshness.snapshotKey);
    });
  });
});
