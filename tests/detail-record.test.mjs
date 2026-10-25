import assert from 'node:assert/strict';
import test from 'node:test';
import { detailRecordNotices } from '../src/domain/detail-presentation.ts';
import { createMessages } from '../src/i18n/messages.ts';
import { detailFallbackReasons } from '../src/domain/match-detail.ts';

const market = (kind, provisional) => ({ source: { kind, provisional } });
const detail = (snapshot, fixture = {}) => ({ snapshot, fixture: { partialCoverage: false, update: { prediction: 'current', result: 'current' }, ...fixture } });

test('the visible record identifies the locked fallback without a result-delay notice or current AI claim', () => {
  const data = detail({ applicability: 'locked', markets: [market('api-football', true), market('api-football', true)] },
    { forecast: { provisional: false, markets: [{ market: { source: 'ai' } }] }, update: { prediction: 'locked', result: 'delayed' } });
  const notices = detailRecordNotices(data);
  assert.deepEqual(notices, ['market.source.api-football', 'match.provisional', 'history.status.locked']);
  const text = notices.map((key) => createMessages('en').text(key)).join(' · ');
  assert.match(text, /API-Football/);
  assert.match(text, /Provisional estimate/);
  assert.match(text, /Locked prediction/);
  assert.doesNotMatch(text, /Score and result updates delayed|AI prediction|Current prediction/);
});

test('historical and void records retain their own provenance instead of inheriting current refresh claims', () => {
  for (const applicability of ['historical', 'void']) {
    const data = detail({ applicability, markets: [market('ai', false)] },
      { forecast: { provisional: true }, update: { prediction: 'delayed', result: 'current' } });
    assert.deepEqual(detailRecordNotices(data), ['market.source.ai', `history.status.${applicability}`]);
  }
  assert.deepEqual(detailRecordNotices(detail({ applicability: 'current', markets: [market('ai', false), market('api-football', true)] },
    { partialCoverage: true, update: { prediction: 'delayed', result: 'current' } })),
  ['market.source.ai', 'market.source.api-football', 'match.provisional', 'history.status.current', 'detail.refresh.delayed', 'match.partialCoverage']);
});

test('missing locked snapshots cannot borrow a forecast, source, or provisional label', () => {
  assert.deepEqual(detailRecordNotices(detail(null, { cycle: { state: 'closed' }, forecast: { provisional: true },
    update: { prediction: 'locked', result: 'delayed' } })), ['detail.noLockedPrediction']);
  assert.deepEqual(detailRecordNotices(detail(null)), []);
  assert.deepEqual(detailRecordNotices(detail(null, { update: { prediction: 'outside-window', result: 'untracked' } })),
    ['detail.refresh.outside-window']);
});

test('every stored fallback reason, including the provider-first baseline, has its own detail copy', () => {
  const messages = createMessages('en');
  for (const reason of detailFallbackReasons) assert.notEqual(messages.text(`detail.fallback.${reason}`), `detail.fallback.${reason}`);
  const baseline = messages.text('detail.fallback.provider-first');
  assert.match(baseline, /reviewed baseline/u); assert.match(baseline, /prediction/u);
  assert.doesNotMatch(baseline, /\bpicks?\b|fallback/iu);
});
