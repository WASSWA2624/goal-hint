import assert from 'node:assert/strict';
import test from 'node:test';
import { addReportingDays, parseReportingDate } from '../src/domain/calendar.ts';
import { defaultBestSlipsQuery } from '../src/domain/best-slips-query.ts';
import { createPublishedBestSlipsService, gateBestSlips } from '../src/server/slips/best-slips.ts';
import { createBestSlipsHandler } from '../src/server/slips/best-slips-http.ts';

const today = parseReportingDate('2026-10-30'), yesterday = addReportingDays(today, -1), tomorrow = addReportingDays(today, 1);
const at = Date.parse(`${today}T12:00:00+03:00`);
const guest = { tier: 'free', signedIn: false, mode: 'off' };
const expired = { ...guest, signedIn: true }, subscriber = { ...expired, tier: 'full' };
function publication(day) {
  const publishedAt = Date.parse(`${day}T06:15:00+03:00`);
  const slip = { id: `private-${day}`, selections: [{ fixtureId: `public-fixture-${day}`, kickoffAt: at,
    homeTeam: { id: 'home', name: 'Home' }, awayTeam: { id: 'away', name: 'Away' }, competition: { id: 'league', name: 'League', country: null },
    family: 'match-result', selection: 'home-win', odds: '5.00', probability: .7, oddsBasis: 'bookmaker' }], totalOdds: '5.00', averageProbability: .7 };
  return { rank: 1, matchCount: 1, totalOdds: slip.totalOdds, averageProbability: slip.averageProbability,
    estimatedProbability: .7, publicationDay: day, publishedAt, outcome: day < today ? 'won' : 'pending', completed: day < today, slip };
}
const result = (slips) => ({ day: today, state: 'generated', searchLimited: false, partialCoverage: false, slips });

test('all viewers start today with public previews and subscriber predictions', async () => {
  const dates = [];
  const read = createPublishedBestSlipsService({ providerOdds: true, now: () => at,
    read: async (day) => { dates.push(day); return { ...result([publication(day)]), day }; } });
  for (const viewer of [guest, expired, subscriber]) {
    const data = await read(viewer), entitled = viewer.tier === 'full';
    assert.equal(data.day, today); assert.equal(data.entitled, entitled);
    assert.equal(data.slips[0].publicationDay, today);
    assert.equal(!!data.slips[0].slip, entitled);
    assert.equal(data.slips[0].preview?.[0].pick ?? null, null);
    assert.equal(defaultBestSlipsQuery(entitled).period, 'today');
  }
  assert.deepEqual(dates, [today, today, today]);
});

test('completion controls prediction release independently of date or an early settled loss', () => {
  const completedToday = { ...publication(today), completed: true, outcome: 'won', status: 'won' };
  const undated = { ...publication(yesterday), publicationDay: undefined };
  const unfinishedOldLoss = { ...publication(yesterday), completed: false, outcome: 'lost', status: 'lost' };
  const input = result([publication(yesterday), publication(today), publication(tomorrow), undated, unfinishedOldLoss, completedToday]);
  for (const viewer of [guest, expired]) {
    const data = gateBestSlips(input, viewer);
    assert.equal(data.entitled, false);
    assert.equal(data.slips.length, 6);
    assert.ok(data.slips.every(view => view.completed ? view.slip : view.preview.every(leg => leg.pick === null)));
    assert.equal(data.slips.at(-1).publicationDay, today);
    assert.equal(data.slips.at(-1).outcome, 'won');
  }
  const full = gateBestSlips(input, subscriber);
  assert.equal(full.entitled, true); assert.equal(full.slips.length, input.slips.length);
});

test('API expiry re-reads a custom range and returns safe previews with unchanged public totals', async () => {
  let checks = 0;
  const handler = createBestSlipsHandler({ now: () => at, access: async () => checks++ === 0 ? subscriber : expired,
    browse: async (_viewer, query) => ({ ...result([publication(yesterday), publication(today), publication(tomorrow)]), entitled: true,
      browse: { query, total: 3, pageSize: 20, hasMore: false, nextCursor: null, from: yesterday, to: tomorrow } }) });
  const response = await handler(new Request(`https://goalhint.com/api/best-slips?period=custom&from=${yesterday}&to=${tomorrow}`));
  assert.equal(response.status, 200); assert.equal(checks, 3);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const data = await response.json();
  assert.equal(data.entitled, false); assert.ok(data.slips[0].slip);
  assert.equal(data.slips.length, 3); assert.equal(data.browse.total, 3);
  assert.doesNotMatch(JSON.stringify(data.slips.slice(1)), /home-win|oddsBasis|private-/);
});

test('API filters without a date use the viewer default, and unavailable defaults preserve access state without data', async () => {
  for (const viewer of [guest, expired, subscriber]) {
    let received;
    const handler = createBestSlipsHandler({ now: () => at, access: async () => viewer,
      browse: async (_viewer, query) => { received = query; return result([]); } });
    const response = await handler(new Request('https://goalhint.com/api/best-slips?status=won'));
    assert.equal(response.status, 200); assert.equal(received.status, 'won');
    assert.equal(received.period, 'today');
    const read = createPublishedBestSlipsService({ providerOdds: true, now: () => at, read: async () => { throw new Error('private'); } });
    const data = await read(viewer);
    assert.equal(data.entitled, viewer.tier === 'full'); assert.equal(data.state, 'data-unavailable'); assert.deepEqual(data.slips, []);
  }
});

test('API re-reads an implicit default after a subscription change so date, entitlement and selections agree', async () => {
  for (const suffix of ['', '?status=won']) {
    for (const [initial, final] of [[subscriber, expired], [guest, subscriber]]) {
      let checks = 0;
      const days = [];
      const read = createPublishedBestSlipsService({ providerOdds: true, now: () => at,
        read: async (day) => { days.push(day); return { ...result([publication(day)]), day }; } });
      const handler = createBestSlipsHandler({ now: () => at, read, access: async () => checks++ === 0 ? initial : final,
        browse: async (viewer, query) => { days.push(query.period === 'today' ? today : yesterday);
          return result([publication(query.period === 'today' ? today : yesterday)]); } });
      const response = await handler(new Request(`https://goalhint.com/api/best-slips${suffix}`));
      const data = await response.json(), entitled = final.tier === 'full';
      assert.equal(response.status, 200); assert.equal(checks, 3);
      assert.deepEqual(days, [today, today]);
      assert.equal(data.entitled, entitled); assert.equal(data.day, today);
      assert.equal(data.slips[0].publicationDay, today);
      assert.equal(!!data.slips[0].slip, entitled);
    }
  }
});

test('a second access change during the fallback read returns no slip data', async () => {
  let checks = 0;
  const handler = createBestSlipsHandler({ now: () => at, access: async () => [subscriber, expired, subscriber][checks++],
    browse: async (_viewer, query) => ({ ...result([publication(yesterday)]), browse: {
      query, total: 1, pageSize: 50, hasMore: false, nextCursor: null, from: yesterday, to: yesterday,
    } }) });
  const response = await handler(new Request('https://goalhint.com/api/best-slips?period=yesterday'));
  assert.equal(response.status, 503); assert.equal(checks, 3);
  assert.doesNotMatch(await response.text(), /private-fixture|selections|probability/);
});

test('mixed early-lost slips release only proved complete original selections and never sidecar picks', () => {
  const first = publication(today).slip.selections[0], pending = { ...first, fixtureId: 'unfinished', odds: '7.73', probability: .6173, selection: 'away-win' };
  const view = { ...publication(today), outcome: 'lost', status: 'lost', completed: false,
    completedFixtureIds: [first.fixtureId], slip: { ...publication(today).slip, selections: [first, pending] },
    matchStates: [{ fixtureId: pending.fixtureId, family: pending.family, selection: pending.selection, status: 'live',
      score: { home: 1, away: 0 }, liveClock: null, outcome: 'pending' }] };
  const input = result([view]), raw = JSON.stringify(input);
  for (const viewer of [guest, expired]) {
    const safe = gateBestSlips(input, viewer), preview = safe.slips[0].preview;
    assert.equal(preview.length, 2); assert.equal(preview[0].pick.selection, first.selection);
    assert.equal(preview[1].pick, null); assert.equal(preview[1].fixture.status, 'live');
    assert.equal(preview[1].fixture.forecast, null); assert.equal(preview[1].fixture.cycleId, null);
    assert.doesNotMatch(JSON.stringify(safe), /7\.73|0\.6173|away-win|completedFixtureIds|matchStates/);
    assert.deepEqual(gateBestSlips(safe, viewer), safe, 'the page and HTTP final projection is idempotent');
  }
  assert.equal(JSON.stringify(input), raw);
  assert.deepEqual(gateBestSlips(input, subscriber).slips[0].slip, view.slip);
});
