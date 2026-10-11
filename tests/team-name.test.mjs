import assert from "node:assert/strict";
import test from "node:test";
import { teamCodePattern, validTeamCode } from "../src/domain/team-name.ts";

test("codes are accepted only as 2–5 letters or digits", () => {
  for (const [code, expected] of [["MUN", "MUN"], [" ars ", "ARS"], ["LAFC", "LAFC"], ["B04", "B04"], ["AB", "AB"], ["ABCDE", "ABCDE"],
    ["A", null], ["ABCDEF", null], ["M-U", null], ["MÜN", null], ["", null], [null, null], [undefined, null],
    // Only ASCII before uppercasing: "ß" and "ı" uppercase to ASCII letters but are not codes.
    ["ßß", null], ["ıst", null], ["\tlfc\n", "LFC"], ["M U", null], ["１２３", null], [123, null], [{}, null]]) {
    assert.equal(validTeamCode(code), expected, String(code));
  }
});

test("every normalized code matches the stored snapshot pattern", () => {
  for (const code of ["mun", " b04 ", "Lafc", "ab"]) assert.match(validTeamCode(code), teamCodePattern, code);
  for (const code of ["mun", "M-U", "ABCDEF", "A"]) assert.doesNotMatch(code, teamCodePattern, code);
});
