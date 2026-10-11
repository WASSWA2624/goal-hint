import assert from "node:assert/strict";
import test from "node:test";
import { countryCode } from "../src/domain/country-code.ts";

/** Every competition country stored on 11 October 2026 (API-Football spelling). */
const storedCountries = ["Spain", "Germany", "Brazil", "Italy", "England", "Greece", "Czech-Republic", "Norway", "Romania", "Sweden",
  "Russia", "Poland", "Portugal", "Finland", "Turkey", "Bulgaria", "Austria", "Belgium", "Hungary", "Scotland",
  "Argentina", "Switzerland", "Mexico", "Slovakia", "South-Africa", "Denmark", "South-Korea", "Slovenia",
  "Netherlands", "World", "USA", "Japan", "Croatia", "Ukraine", "Chile", "Serbia", "Lithuania", "Colombia", "China",
  "Estonia", "Bosnia", "Latvia", "Wales", "Uruguay", "France", "Faroe-Islands", "Paraguay", "Morocco", "Kosovo",
  "Macedonia", "Ghana", "Ecuador", "Bolivia", "Algeria", "Cyprus", "Moldova", "Northern-Ireland", "Montenegro",
  "Azerbaijan", "Vietnam", "Indonesia", "Iran", "Venezuela", "Belarus", "Tunisia", "Jordan", "Costa-Rica",
  "Saudi-Arabia", "Malta", "Albania", "Thailand", "Israel", "Georgia", "Peru", "San-Marino", "Nigeria", "Mauritania",
  "Kazakhstan", "Uganda", "Ireland", "Burundi", "Kenya", "Iraq", "Gibraltar", "Syria", "Luxembourg", "Uzbekistan",
  "Laos", "Iceland", "Canada", "Burkina-Faso", "Hong-Kong", "Kyrgyzstan", "Angola", "Philippines", "Lesotho", "Kuwait",
  "Tajikistan", "United-Arab-Emirates", "Guatemala", "Qatar", "Bangladesh", "India", "Egypt", "Benin", "Turkmenistan",
  "Eswatini", "Singapore", "Botswana", "New-Zealand", "Antigua-And-Barbuda", "Ivory-Coast", "Panama", "Malaysia",
  "Gabon", "El-Salvador", "Honduras", "Tanzania", "Jamaica", "Zimbabwe", "Rwanda", "Dominican-Republic", "Zambia",
  "Andorra", "Suriname", "Armenia", "Malawi", "Myanmar", "Australia", "Mongolia", "Chinese-Taipei", "Ethiopia", "Oman",
  "Nicaragua", "Bahrain"];

test("the reference photo's countries read as their FIFA codes", () => {
  for (const [country, code] of [["England", "ENG"], ["Spain", "ESP"], ["Italy", "ITA"], ["Germany", "GER"], ["France", "FRA"],
    ["Portugal", "POR"], ["Netherlands", "NED"], ["Saudi-Arabia", "KSA"], ["Turkey", "TUR"], ["Scotland", "SCO"], ["Belgium", "BEL"]]) {
    assert.equal(countryCode(country), code, country);
  }
});

test("provider spellings and common variants match; international competitions read INT", () => {
  for (const [country, code] of [["World", "INT"], ["Czech-Republic", "CZE"], ["Czechia", "CZE"], ["South-Korea", "KOR"],
    ["Korea Republic", "KOR"], ["USA", "USA"], ["United States", "USA"], ["Türkiye", "TUR"], ["Ivory-Coast", "CIV"],
    ["Côte d'Ivoire", "CIV"], ["Bosnia", "BIH"], ["Bosnia and Herzegovina", "BIH"], ["Antigua-And-Barbuda", "ATG"],
    ["Saint Vincent & the Grenadines", "VIN"], ["Northern-Ireland", "NIR"], ["Wales", "WAL"], ["Chinese-Taipei", "TPE"],
    ["United-Arab-Emirates", "UAE"], ["South-Africa", "RSA"], ["Switzerland", "SUI"], ["Uganda", "UGA"], ["  england ", "ENG"]]) {
    assert.equal(countryCode(country), code, country);
  }
});

test("every stored country has a distinct three-letter code", () => {
  const seen = new Map();
  for (const country of storedCountries) {
    const code = countryCode(country);
    assert.match(code, /^[A-Z]{3}$/u, country);
    assert.equal(seen.get(code) ?? country, country, `${code}: ${seen.get(code)} and ${country}`);
    seen.set(code, country);
  }
});

test("unknown countries derive a code, given codes are kept and empty names have none", () => {
  for (const [country, code] of [["Crimea", "CRI"], ["Narnia Republic", "NRE"], ["Central Narnia Isles", "CNI"], ["Isle of Man", "IMA"],
    ["Ålandia", "ALA"], ["ENG", "ENG"], ["EU", "EU"], ["", ""], ["   ", ""], [null, ""], [undefined, ""], ["-", ""]]) {
    assert.equal(countryCode(country), code, String(country));
  }
});
