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
  const slip = { id: `private-${day}`, selections: [{ fixtureId: `private-fixture-${day}` }], totalOdds: '5.00', averageProbability: .7 };
  return { rank: 1, matchCount: 1, totalOdds: slip.totalOdds, averageProbability: slip.averageProbability,
    estimatedProbability: .7, publicationDay: day, publishedAt, outcome: day < today ? 'won' : 'pending', slip };
}
const result = (slips) => ({ day: today, state: 'generated', searchLimited: false, partialCoverage: false, slips });

test('guest and expired defaults show yesterday while subscribers start today, using the current EAT day as anchor', async () => {
  const dates = [];
  const read = createPublishedBestSlipsService({ providerOdds: true, now: () => at,
    read: async (day) => { dates.push(day); return { ...result([publication(day)]), day }; } });
  for (const viewer of [guest, expired, subscriber]) {
    const data = await read(viewer), entitled = viewer.tier === 'full';
    assert.equal(data.day, today); assert.equal(data.entitled, entitled);
    assert.equal(data.slips[0].publicationDay, entitled ? today : yesterday);
    assert.ok(data.slips[0].slip, 'past results and subscriber predictions include the slip');
    assert.equal(defaultBestSlipsQuery(entitled).period, entitled ? 'today' : 'yesterday');
  }
  assert.deepEqual(dates, [yesterday, yesterday, today]);
});

test('mixed date ranges release historical slips while current, future and undated predictions remain locked', () => {
  const input = result([publication(yesterday), publication(today), publication(tomorrow),
    { ...publication(yesterday), publicationDay: undefined }]);
  for (const viewer of [guest, expired]) {
    const data = gateBestSlips(input, viewer);
    assert.equal(data.entitled, false);
    assert.ok(data.slips[0].slip);
    assert.equal(data.slips[0].publishedAt, input.slips[0].publishedAt);
    assert.ok(data.slips.slice(1).every((view) => !view.slip && !view.matchStates));
    assert.doesNotMatch(JSON.stringify(data.slips.slice(1)), /private-fixture|selections|private-/);
  }
  const full = gateBestSlips(input, subscriber);
  assert.equal(full.entitled, true); assert.ok(full.slips.every((view) => view.slip));
});

test('API expiry keeps public past results but strips current and future selections from a custom range', async () => {
  let checks = 0;
  const handler = createBestSlipsHandler({ now: () => at, access: async () => checks++ === 0 ? subscriber : expired,
    browse: async (_viewer, query) => ({ ...result([publication(yesterday), publication(today), publication(tomorrow)]), entitled: true,
      browse: { query, total: 3, pageSize: 20, hasMore: false, nextCursor: null, from: yesterday, to: tomorrow } }) });
  const response = await handler(new Request(`https://goalhint.com/api/best-slips?period=custom&from=${yesterday}&to=${tomorrow}`));
  assert.equal(response.status, 200); assert.equal(checks, 2);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const data = await response.json();
  assert.equal(data.entitled, false); assert.ok(data.slips[0].slip);
  assert.ok(data.slips.slice(1).every((view) => !view.slip));
  assert.doesNotMatch(JSON.stringify(data.slips.slice(1)), /private-fixture|selections|private-/);
});

test('API filters without a date use the viewer default, and unavailable defaults preserve access state without data', async () => {
  for (const viewer of [guest, expired, subscriber]) {
    let received;
    const handler = createBestSlipsHandler({ now: () => at, access: async () => viewer,
      browse: async (_viewer, query) => { received = query; return result([]); } });
    const response = await handler(new Request('https://goalhint.com/api/best-slips?status=won'));
    assert.equal(response.status, 200); assert.equal(received.status, 'won');
    assert.equal(received.period, viewer.tier === 'full' ? 'today' : 'yesterday');
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
      assert.deepEqual(days, initial.tier === 'full' ? [today, yesterday] : [yesterday, today]);
      assert.equal(data.entitled, entitled); assert.equal(data.day, today);
      assert.equal(data.slips[0].publicationDay, entitled ? today : yesterday);
      assert.ok(data.slips[0].slip);
    }
  }
});
