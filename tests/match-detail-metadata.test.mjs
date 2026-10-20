import assert from 'node:assert/strict';
import test from 'node:test';
import { matchDetailMetadata } from '../src/server/matches/detail-page.ts';
import { gateFixture } from '../src/domain/paywall.ts';
import { cardFixture } from './helpers/match-card-fixtures.mjs';
const approved = { deployment: 'production', index: true };
const path = '/en/matches/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/example-home-fc-vs-example-away-fc';
const metadataFor = (fixture, mode = 'off', variant = false) => matchDetailMetadata({ data: { fixture, route: { path } }, error: null }, 'en', variant, approved, mode);
test('search and social descriptions stay generic across full, gated, void and historical predictions', () => {
  for (const status of ['scheduled', 'live', 'postponed', 'abandoned', 'finished-regulation', 'canceled']) {
    const full = cardFixture({ status, score: null }, 'ai', status === 'postponed' ? 'void' : null);
    for (const fixture of [full, gateFixture(full, { tier: 'free', signedIn: false })]) {
      const metadata = metadataFor(fixture);
      assert.match(metadata.description, /^Football predictions, sources and regulation-time results for Example Home FC v Example Away FC on /);
      assert.doesNotMatch(metadata.description, /Home win|54%|70%|estimate:|Void forecast record/);
      assert.equal(metadata.openGraph.description, metadata.description); assert.equal(metadata.twitter.description, metadata.description);
      assert.equal(metadata.alternates.canonical, `https://goalhint.com${path}`); assert.equal(metadata.robots.index, true);
      assert.equal(metadataFor(fixture, 'off', true).robots.index, false);
    }
  }
});
test('subscriber metadata line appears only in on mode for every fixture status', () => {
  const fixture = cardFixture({ status: 'scheduled', score: null }, 'ai', null);
  assert.match(metadataFor(fixture, 'on').description, /Subscriber access/);
  for (const mode of ['off', 'test', 'free']) assert.doesNotMatch(metadataFor(fixture, mode).description, /Subscriber access/);
  for (const status of ['finished-regulation', 'finished-extra-time', 'finished-penalties', 'canceled', 'awarded'])
    assert.match(metadataFor({ ...fixture, status }, 'on').description, /Subscriber access/);
});
test('undated, missing and failed records never borrow predictions or dates', () => {
  assert.equal(metadataFor(cardFixture({ kickoffAt: null })).description,
    'Stored predictions, sources and regulation-time results for Example Home FC v Example Away FC.');
  assert.equal(metadataFor(cardFixture({ forecast: null })).robots.index, false);
  const failed = matchDetailMetadata({ data: null, error: 'unavailable' }, 'en', false, approved);
  assert.equal(failed.robots.index, false); assert.doesNotMatch(failed.description, /Void forecast record|estimate:|%/);
});
