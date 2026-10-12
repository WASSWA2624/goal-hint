import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import test from 'node:test';
import { countryFlagAsset, isLocalCountryFlagAsset } from '../src/domain/country-flag.ts';

test('known football countries resolve local flags, including provider aliases and home nations', async () => {
  const examples = { England: 'gb-eng', Scotland: 'gb-sct', Wales: 'gb-wls', 'Northern Ireland': 'gb-nir', Brazil: 'br',
    'Antigua-And-Barbuda': 'ag', Venezuela: 've', 'El Salvador': 'sv', Germany: 'de', 'Saudi-Arabia': 'sa',
    'Côte d’Ivoire': 'ci', 'Korea Republic': 'kr', 'United States': 'us', Uganda: 'ug' };
  for (const [country, code] of Object.entries(examples)) {
    const asset = countryFlagAsset(country);
    assert.equal(asset, `/flags/${code}.svg`, country);
    await access(new URL(`../public${asset}`, import.meta.url));
  }
});

test('unknown and international countries cannot borrow a flag from a derived abbreviation', () => {
  for (const country of [null, undefined, '', 'World', 'International', 'Synthetic country', 'Brazilian imaginary country', '__proto__']) {
    assert.equal(countryFlagAsset(country), null, String(country));
  }
  assert.equal(countryFlagAsset('BRA'), '/flags/br.svg');
});

test('local image permissions only include exact bundled country flag paths', () => {
  for (const country of ['England', 'Brazil', 'Uganda']) assert.equal(isLocalCountryFlagAsset(countryFlagAsset(country)), true);
  for (const path of ['/flags/unknown.svg', '/flags/README.md', '/flags/../favicon.svg', '/flags/br.svg?x=1',
    '/flags/br.svg#x', '//example.test/flags/br.svg', 'flags/br.svg', '/other/br.svg', '/flags/BR.svg']) {
    assert.equal(isLocalCountryFlagAsset(path), false, path);
  }
});
