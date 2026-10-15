import assert from 'node:assert/strict';
import test from 'node:test';
import { matchDetailMetadata } from '../src/server/matches/detail-page.ts';
import { cardFixture } from './helpers/match-card-fixtures.mjs';

const approved = { deployment: 'production', index: true };
const path = '/en/matches/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/example-home-fc-vs-example-away-fc';
const metadataFor = fixture => matchDetailMetadata({ data: { fixture, route: { path } }, error: null }, 'en', false, approved);

test('an open forecast preview describes available markets and history without claiming a locked record', () => {
  const metadata = metadataFor(cardFixture({ status: 'scheduled', score: null }, 'ai', null));
  assert.match(metadata.description, /Match result \(1X2\) estimate: Example Home FC win, 54%\./);
  assert.match(metadata.description, /See available markets, sources and forecast history\. Not a guarantee\.$/);
  assert.doesNotMatch(metadata.description, /[Vv]oid|locked forecast/);
  assert.equal(metadata.openGraph.description, metadata.description);
  assert.equal(metadata.twitter.description, metadata.description);
});

test('verified void forecasts are labelled before the pick in search and social previews', () => {
  const fixture = cardFixture({ status: 'postponed', score: null }, 'ai', 'void');
  const metadata = metadataFor(fixture);
  assert.match(metadata.description, /^Void forecast record\. Example Home FC v Example Away FC,/);
  assert.match(metadata.description, /Example Home FC win, 54%\./);
  assert.equal(metadata.openGraph.description, metadata.description);
  assert.equal(metadata.twitter.description, metadata.description);
  assert.equal(metadata.alternates.canonical, `https://goalhint.com${path}`);
  assert.equal(metadata.robots.index, true, 'Voided forecasts retain their legitimate historical identity.');
  const variant = matchDetailMetadata({ data: { fixture, route: { path } }, error: null }, 'en', true, approved);
  assert.equal(variant.description, metadata.description);
  assert.equal(variant.robots.index, false, 'History variants keep their existing indexing policy.');
});

test('void preview labels require matching cycle, revision and selection evidence', () => {
  for (const mismatch of [{ cycleId: 'other-cycle' }, { revisionId: 'older-revision' }, { selection: 'draw' }]) {
    const fixture = cardFixture({ status: 'postponed', score: null }, 'ai', 'void');
    Object.assign(fixture.forecast.markets.find(item => item.market.family === 'match-result').outcome, mismatch);
    assert.doesNotMatch(metadataFor(fixture).description, /^Void forecast record\./);
  }
  assert.doesNotMatch(metadataFor(cardFixture({ status: 'postponed', score: null }, 'ai', null)).description,
    /^Void forecast record\./, 'A postponement alone must not invent a settlement.');
});

test('partial and undated void records stay honest without borrowing missing markets or dates', () => {
  const fixture = cardFixture({ status: 'canceled', score: null }, 'api-football', 'void');
  fixture.forecast.markets = fixture.forecast.markets.filter(item => item.market.family === 'total-goals');
  const metadata = metadataFor(fixture);
  assert.match(metadata.description, /^Void forecast record\./);
  assert.match(metadata.description, /Over\/Under 2\.5 goals estimate: Under 2\.5, 70%/);
  assert.doesNotMatch(metadata.description, /Match result \(1X2\)/);
  assert.equal(metadataFor({ ...fixture, kickoffAt: null }).description,
    'Void forecast record. Stored predictions, sources and regulation-time results for Example Home FC v Example Away FC.');
});

test('missing forecasts and failed reads never invent a pick or a void record', () => {
  const metadata = metadataFor(cardFixture({ forecast: null, status: 'postponed', score: null }));
  assert.doesNotMatch(metadata.description, /Void forecast record|estimate:|%/);
  assert.equal(metadata.robots.index, false);
  const failed = matchDetailMetadata({ data: null, error: 'unavailable' }, 'en', false, approved);
  assert.equal(failed.robots.index, false);
  assert.doesNotMatch(failed.description, /Void forecast record|estimate:|%/);
});
