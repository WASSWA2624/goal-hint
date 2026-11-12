import assert from 'node:assert/strict';
import test from 'node:test';
import { searchMarketFilters } from '../src/domain/market-filter-search.ts';
import { slipMarketSelections } from '../src/domain/slip-markets.ts';
import { createMessages } from '../src/i18n/messages.ts';

const messages = createMessages('en');

function matches(query, family, outcomes, familyControl = false) {
  assert.deepEqual(searchMarketFilters(query, messages), {
    families: new Set(familyControl ? [family] : []), outcomes: new Map([[family, new Set(outcomes)]]),
  }, query);
}

test('blank searches are inactive and unsupported markets do not invent choices', () => {
  for (const query of ['', '  ', '--?']) assert.equal(searchMarketFilters(query, messages), null, query);
  for (const query of ['corners', 'draw no bet', 'over 3.5', 'over 1.5 under 2.5']) {
    assert.deepEqual(searchMarketFilters(query, messages), { families: new Set(), outcomes: new Map() }, query);
  }
});

test('a market word or numeric line inside unrelated text is not an outcome match', () => {
  for (const query of ['zz-no-such-market-9876', 'draw 9876', 'BTTS random 9876', 'over unknown 1.5', 'match result garbage']) {
    assert.deepEqual(searchMarketFilters(query, messages), { families: new Set(), outcomes: new Map() }, query);
  }
});

test('family labels, prefixes, reordered words, misspellings and short forms expand their outcomes', () => {
  for (const [query, family] of [
    ['1X2', 'match-result'], ['1 x 2', 'match-result'], ['result match', 'match-result'], ['DC', 'double-chance'],
    ['doub', 'double-chance'], ['doubel chnace', 'double-chance'], ['BTTS', 'both-teams-to-score'],
    ['both teams score', 'both-teams-to-score'], ['O/U', 'total-goals'], ['over or under', 'total-goals'], ['total goals', 'total-goals'],
  ]) matches(query, family, slipMarketSelections[family], true);
});

test('exact outcome names and betting codes keep the family controls separate', () => {
  for (const [query, family, outcome] of [
    ['1', 'match-result', 'home-win'], ['draw', 'match-result', 'draw'], ['1X', 'double-chance', 'home-or-draw'],
    ['1 X', 'double-chance', 'home-or-draw'], ['DC 1X', 'double-chance', 'home-or-draw'],
    ['draw away', 'double-chance', 'away-or-draw'], ['BTTS no', 'both-teams-to-score', 'no'],
  ]) matches(query, family, [outcome]);
});

test('directions and decimal goal lines stay exact even with compact forms, reordering and typos', () => {
  for (const query of ['over 1.5', '1.5 over', 'ovre 1.5', 'O1.5']) matches(query, 'total-goals', ['over-1.5']);
  for (const query of ['U2.5', 'under 2,50']) matches(query, 'total-goals', ['under-2.5']);
  for (const query of ['1.5', 'O/U1.5', 'total goals 1.5']) matches(query, 'total-goals', ['over-1.5', 'under-1.5']);
  matches('over', 'total-goals', ['over-2.5', 'over-1.5']);
  matches('total goals 2.5', 'total-goals', ['over-2.5', 'under-2.5'], true);
});
