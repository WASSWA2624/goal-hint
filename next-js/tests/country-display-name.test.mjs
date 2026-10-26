import assert from "node:assert/strict";
import test from "node:test";
import { countryCode, countryDisplayName, countryShortName } from "../src/domain/country-code.ts";
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

test("long recognized country names use a familiar short form on one line; short and unknown names stay as shown", () => {
  for (const [country, name] of [["Dominican-Republic", "Dominican Rep."], ["Dominican Republic", "Dominican Rep."],
    ["Bosnia-And-Herzegovina", "Bosnia & Herz."], ["BIH", "Bosnia & Herz."], ["Northern-Ireland", "N. Ireland"],
    ["NIR", "N. Ireland"], ["North-Macedonia", "N. Macedonia"], ["UAE", "UAE"], ["uae", "UAE"],
    ["United-Arab-Emirates", "UAE"], ["United States of America", "USA"], ["Czech-Republic", "Czechia"],
    ["Republic of Ireland", "Ireland"], ["Trinidad-And-Tobago", "Trinidad"], ["Papua-New-Guinea", "Papua NG"],
    ["COD", "DR Congo"]]) {
    assert.equal(countryShortName(country), name, country);
  }
  // Names that already fit keep their display form, including the expanded USA; unknown long names are left for the
  // layout's ellipsis rather than rewritten.
  for (const [country, name] of [["USA", "United States"], ["England", "England"], ["Saudi-Arabia", "Saudi Arabia"],
    ["Faroe-Islands", "Faroe Islands"], ["Congo-DR", "Congo DR"], ["Chinese-Taipei", "Chinese Taipei"], ["Synthetic Long Nation Name", "Synthetic Long Nation Name"],
    ["World", "World"], ["", ""], [null, ""]]) {
    assert.equal(countryShortName(country), name, String(country));
  }
});

test("display expansion keeps the original mobile code and flag identities available", () => {
  for (const [country, code, flag] of [["USA", "USA", "us"], ["KSA", "KSA", "sa"],
    ["ENG", "ENG", "gb-eng"], ["New-Zealand", "NZL", "nz"]]) {
    assert.equal(countryCode(country), code);
    assert.equal(countryFlagAsset(country), `/flags/${flag}.svg`);
    assert.equal(countryCode(countryDisplayName(country)), code);
  }
});
