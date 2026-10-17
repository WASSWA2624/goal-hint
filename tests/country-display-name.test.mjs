import assert from "node:assert/strict";
import test from "node:test";
import { countryCode, countryDisplayName } from "../src/domain/country-code.ts";
import { countryFlagAsset } from "../src/domain/country-flag.ts";

test("recognized football abbreviations expand to full country names, including home nations", () => {
  for (const [country, name] of [["USA", "United States"], ["KSA", "Saudi Arabia"], ["ENG", "England"],
    ["SCO", "Scotland"], ["WAL", "Wales"], ["NIR", "Northern Ireland"], ["UAE", "United Arab Emirates"],
    ["BIH", "Bosnia and Herzegovina"], ["COD", "Democratic Republic of the Congo"], ["MKD", "North Macedonia"],
    ["BRA", "Brazil"], ["eng", "England"], ["  KSA ", "Saudi Arabia"]]) {
    assert.equal(countryDisplayName(country), name, country);
  }
});

test("known hyphenated provider names get spaces while full names and accents remain intact", () => {
  for (const [country, name] of [["New-Zealand", "New Zealand"], ["Saudi-Arabia", "Saudi Arabia"],
    ["Northern-Ireland", "Northern Ireland"], ["Côte-d’Ivoire", "Côte d’Ivoire"],
    ["United States of America", "United States of America"], ["Türkiye", "Türkiye"],
    ["Côte d’Ivoire", "Côte d’Ivoire"], ["Curaçao", "Curaçao"], ["England", "England"]]) {
    assert.equal(countryDisplayName(country), name, country);
  }
});

test("unknown and missing country labels are not invented or rewritten", () => {
  for (const country of ["Synthetic-Nation", "ZZZ", "EU", "Narnia", "__proto__", "World"]) {
    assert.equal(countryDisplayName(country), country);
  }
  for (const country of [null, undefined, "", "   "]) assert.equal(countryDisplayName(country), "");
});

test("display expansion keeps the original mobile code and flag identities available", () => {
  for (const [country, code, flag] of [["USA", "USA", "us"], ["KSA", "KSA", "sa"],
    ["ENG", "ENG", "gb-eng"], ["New-Zealand", "NZL", "nz"]]) {
    assert.equal(countryCode(country), code);
    assert.equal(countryFlagAsset(country), `/flags/${flag}.svg`);
    assert.equal(countryCode(countryDisplayName(country)), code);
  }
});
