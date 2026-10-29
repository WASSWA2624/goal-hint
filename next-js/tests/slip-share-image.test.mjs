import assert from 'node:assert/strict';
import test from 'node:test';
import { layoutSlipShareImages, slipShareImageRules, wrapSlipShareImageText } from '../src/domain/slip-share-image.ts';

const selection = {
  fixtureId: '00000000-0000-4000-8000-000000000001', kickoffAt: Date.parse('2026-10-29T15:30:00Z'),
  homeTeam: { id: 'home', name: 'Arsenal', logoUrl: null }, awayTeam: { id: 'away', name: 'Chelsea', logoUrl: null },
  competition: { id: 'league', name: 'Premier League', country: 'England', logoUrl: null },
  family: 'match-result', selection: 'home-win', probability: 0.762, odds: '1.72', oddsBasis: 'bookmaker',
};
const shared = {
  id: 'a'.repeat(32), url: `https://goalhint.com/s/${'a'.repeat(32)}`, createdAt: '2026-10-29T10:00:00.000Z',
  slip: { id: 'original-slip', selections: [selection], totalOdds: '1.72', oddsBasis: 'bookmaker', averageProbability: 0.762 },
};
// Font-role-aware deterministic metrics make pagination independent of host font installation.
const measure = (value, font) => Array.from(value).length * (font === 'teams' ? 19 : font === 'total' ? 30 : 15);

test('a normal slip becomes one complete branded image with its immutable ID and links', () => {
  const [page] = layoutSlipShareImages(shared, 'en', measure);
  assert.equal(page.pageCount, 1);
  assert.equal(page.reference, shared.id);
  assert.equal(page.width, 1080);
  assert.ok(page.height <= slipShareImageRules.maximumHeight);
  assert.equal(page.rows.length, 1);
  assert.equal(page.rows[0].teams.join(' '), 'Arsenal vs Chelsea');
  assert.match(page.rows[0].pick.join(' '), /Home win/u);
  assert.match(page.rows[0].metadata.join(' '), /EAT/u);
  assert.equal(page.rows[0].odds, '1.72');
  assert.deepEqual(page.totalOdds, ['1.72']);
  assert.match(page.footer.join('\n'), /Created with Goal Hint\nhttps:\/\/goalhint.com\nhttps:\/\/goalhint.com\/s\//u);
});

test('the maximum 800 selections paginate without loss, duplication, or an oversized canvas', () => {
  const selections = Array.from({ length: 800 }, (_, i) => ({ ...selection, fixtureId: `fixture-${i}` }));
  const pages = layoutSlipShareImages({ ...shared, slip: { ...shared.slip, selections } }, 'en', measure);
  assert.equal(pages.length, 25);
  assert.deepEqual(pages.flatMap(page => page.rows.map(row => row.fixtureId)), selections.map(item => item.fixtureId));
  assert.deepEqual(pages.flatMap(page => page.rows.map(row => row.selectionIndex)), Array.from({ length: 800 }, (_, i) => i));
  for (const [index, page] of pages.entries()) {
    assert.equal(page.index, index);
    assert.equal(page.pageCount, pages.length);
    assert.equal(page.selectionCount, 800);
    assert.ok(page.height <= slipShareImageRules.maximumHeight);
    assert.ok(page.rows.length <= slipShareImageRules.maximumRowsPerImage);
    assert.ok(page.rows.every(row => row.top + row.height < page.footerTop));
    assert.match(page.footer.join('\n'), /goalhint.com\/s\//u);
  }
});

test('long international names wrap in full without silently shortening a selection', () => {
  const home = 'Borussia Mönchengladbach '.repeat(20).trim();
  const away = 'クラブ⚽👨‍👩‍👧‍👦'.repeat(25);
  const input = { ...shared, slip: { ...shared.slip, selections: [{ ...selection, homeTeam: { ...selection.homeTeam, name: home }, awayTeam: { ...selection.awayTeam, name: away } }] } };
  const page = layoutSlipShareImages(input, 'en', measure)[0];
  assert.equal(page.rows[0].teams.join('').replaceAll(' ', ''), `${home} vs ${away}`.replaceAll(' ', ''));
  assert.ok(page.height <= slipShareImageRules.maximumHeight);
});

test('measured long rows force a page break before the maximum canvas height', () => {
  const name = 'International Club Qualification '.repeat(16).trim();
  const selections = Array.from({ length: 25 }, (_, index) => ({ ...selection, fixtureId: `long-${index}`,
    homeTeam: { ...selection.homeTeam, name }, awayTeam: { ...selection.awayTeam, name } }));
  const pages = layoutSlipShareImages({ ...shared, slip: { ...shared.slip, selections } }, 'en', measure);
  assert.ok(pages.length > 1);
  assert.deepEqual(pages.flatMap(page => page.rows.map(row => row.fixtureId)), selections.map(item => item.fixtureId));
  assert.ok(pages.every(page => page.height <= slipShareImageRules.maximumHeight));
  assert.ok(pages.every(page => page.rows.length < slipShareImageRules.maximumRowsPerImage));
});

test('wrapping respects grapheme boundaries and retains full long URLs', () => {
  const family = '👨‍👩‍👧‍👦';
  assert.deepEqual(wrapSlipShareImageText(family.repeat(3), 1, text => [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].length), [family, family, family]);
  const url = `https://goalhint.com/s/${'b'.repeat(200)}`;
  const lines = wrapSlipShareImageText(url, 70, text => text.length);
  assert.equal(lines.join(''), url);
  assert.ok(lines.every(line => line.length <= 70));
});

test('invalid empty slips, dates, and unrenderable characters fail rather than return partial exports', () => {
  assert.throws(() => layoutSlipShareImages({ ...shared, slip: { ...shared.slip, selections: [] } }, 'en', measure), RangeError);
  assert.throws(() => layoutSlipShareImages({ ...shared, createdAt: 'invalid' }, 'en', measure), RangeError);
  assert.throws(() => wrapSlipShareImageText('A', 1, () => 2), RangeError);
});
