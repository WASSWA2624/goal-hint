import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import test from "node:test";
import { composePhoneValue, isInternationalPhoneInput, phoneCountries, phoneCountry, searchPhoneCountries, splitPhoneValue } from "../src/domain/phone-countries.ts";
import { normalizePhone, phoneInputIssue } from "../src/domain/phone.ts";

test("country choices have unique identities, calling codes, immutable metadata and usable bundled flags", async () => {
  assert.ok(phoneCountries.length > 200);
  assert.equal(new Set(phoneCountries.map(country => country.iso2)).size, phoneCountries.length);
  assert.ok(Object.isFrozen(phoneCountries));
  for (const country of phoneCountries) {
    assert.match(country.iso2, /^[A-Z]{2}$/u);
    assert.ok(country.name.length > 1);
    assert.match(country.callingCode, /^[1-9][0-9]{0,2}$/u);
    assert.ok(Object.isFrozen(country));
    if (country.iso3) assert.match(country.iso3, /^[A-Z]{3}$/u);
    assert.ok(country.flag, `${country.iso2} has a bundled country flag`);
    assert.match(country.flag, /^\/flags\/[a-z]{2}\.svg$/u);
    await access(new URL(`../public${country.flag}`, import.meta.url));
  }
  assert.equal(phoneCountry("UG").callingCode, "256");
  assert.equal(phoneCountry("GB").callingCode, "44");
});

test("country search accepts names, two/three-letter codes and calling codes without case or accent sensitivity", () => {
  for (const query of ["Uganda", "ug", "UGA", "+256", "  256  "]) {
    assert.ok(searchPhoneCountries(query).some(country => country.iso2 === "UG"), query);
  }
  for (const query of ["United Kingdom", "GBR", "uk", "Britain", "+44"]) {
    assert.ok(searchPhoneCountries(query).some(country => country.iso2 === "GB"), query);
  }
  assert.ok(searchPhoneCountries("cote d ivoire").some(country => country.iso2 === "CI"));
  assert.deepEqual(searchPhoneCountries(""), phoneCountries);
  assert.deepEqual(searchPhoneCountries("no-such-country-987654321"), []);
});

test("exact country identifiers and familiar aliases rank before incidental substring matches", () => {
  for (const [query, expected] of [["UGA", "UG"], ["UK", "GB"], ["+256", "UG"], ["UAE", "AE"], ["DRC", "CD"]]) {
    assert.equal(searchPhoneCountries(query)[0]?.iso2, expected, query);
  }
});

test("empty fields and dialing-code-only seeds keep the selected country without submitting a phone number", () => {
  for (const [country, seed, callingCode] of [["UG", "256", "256"], ["KE", "254", "254"], ["GB", "44", "44"]]) {
    for (const value of ["", "   ", seed]) {
      const parts = splitPhoneValue(value, country);
      assert.deepEqual(parts, { country, callingCode, national: "" });
      assert.equal(composePhoneValue(parts), "");
      assert.equal(phoneInputIssue(composePhoneValue(parts)), null, "optional empty admin search is valid");
      assert.equal(phoneInputIssue(composePhoneValue(parts), true), "required");
    }
  }
});

test("country-specific national trunk prefixes are removed while Italy's significant zero is retained", () => {
  for (const [country, callingCode, national, canonical] of [
    ["UG", "256", "0700 000 101", "256700000101"], ["KE", "254", "0700 000 105", "254700000105"],
    ["GB", "44", "07700 900123", "447700900123"], ["US", "1", "415 555 0123", "14155550123"],
    ["IT", "39", "06 9000 0000", "390690000000"],
  ]) {
    const value = composePhoneValue({ country, callingCode, national });
    assert.equal(value, canonical, country);
    assert.equal(normalizePhone(value), canonical);
  }
});

test("full international values replace an earlier country and round-trip without duplicate prefixes", () => {
  for (const [value, country, callingCode, national] of [
    ["+256 700 000 101", "UG", "256", "700000101"], ["00254 700 000 105", "KE", "254", "700000105"],
    ["447700900123", "GB", "44", "7700900123"], ["+39 06 9000 0000", "IT", "39", "0690000000"],
  ]) {
    const parts = splitPhoneValue(value, "UG");
    assert.deepEqual(parts, { country, callingCode, national });
    assert.equal(composePhoneValue(parts), normalizePhone(value));
  }
  assert.equal(splitPhoneValue("14155550123", "CA").country, "CA", "a shared calling code preserves the selected country");
  const generic = "999700000001";
  assert.deepEqual(splitPhoneValue(generic), { country: null, callingCode: "", national: generic });
  assert.equal(composePhoneValue(splitPhoneValue(generic)), generic, "existing server-accepted generic numbers are not rewritten as Ugandan numbers");
});

test("explicit international typing is distinguished from national digits and malformed input stays invalid", () => {
  for (const value of ["+44", "  +256 700", "0044 7700"]) assert.equal(isInternationalPhoneInput(value), true, value);
  for (const value of ["", "0700000101", "700000101", "447700900123", "Call +44 7700"]) assert.equal(isInternationalPhoneInput(value), false, value);
  for (const national of ["7", "Call 700000101", "700000101 ext 1", "7".repeat(100)]) {
    assert.notEqual(phoneInputIssue(composePhoneValue({ country: "UG", callingCode: "256", national }), true), null, national);
  }
});
