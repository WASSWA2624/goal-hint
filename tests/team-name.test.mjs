import assert from "node:assert/strict";
import test from "node:test";
import { shortTeamName, teamDisplayCandidates, validTeamCode } from "../src/domain/team-name.ts";

test("club tokens are never removed, so a short form never reads as a city, a country or another club", () => {
  // Real stored and local names: dropping the token would leave a country ("Andorra"), another stored club's full name
  // ("Internacional", "Rangers", "Olimpia"), a city ("Malmo") or an adjective ("Chemnitzer").
  for (const name of ["Andorra CF", "FC Andorra", "Hong Kong FC", "Internacional SC", "Rangers FC", "CD Olimpia", "Platense FC",
    "Santa Cruz FC", "FK Partizan", "FC Bocholt", "Europa Fc", "Vitória SC", "Manchester SC", "AFC Malmo", "AFC Amsterdam",
    "FC Frankfurt", "Fortaleza FC", "Los Angeles FC", "New York City FC", "Chemnitzer FC", "Hallescher FC", "Police FC",
    "Express FC", "SC Villa", "Vipers SC", "1. FC Köln", "A.F.C. Bournemouth", "Arsenal F.C.", "FC", "F.C.", "1. FC"]) {
    assert.equal(shortTeamName(name), name, name);
  }
  assert.equal(shortTeamName("FC United of Manchester"), "FC United of Manchester");
});

test("prefixes and qualifiers stay as given", () => {
  for (const name of ["AC Milan", "AS Roma", "SS Lazio", "SSC Napoli", "SL Benfica", "US Lecce", "AJ Auxerre", "Sporting CP",
    "Real Madrid", "Athletic Club", "Athletic Bilbao", "United Arab Emirates", "Linares Unido", "Club Brugge", "Bayern München II",
    "FC Barcelona B", "Arsenal FC Women", "Chelsea FC U21", "Venezuela W", "Liverpool FC Reserves", "Brazil U20", "Saints"]) {
    assert.equal(shortTeamName(name), name, name);
  }
});

test("only widely used forms replace words", () => {
  for (const [name, expected] of [
    ["Manchester United", "Man Utd"], ["Manchester City", "Man City"], ["Manchester United FC", "Man Utd FC"],
    ["Manchester United U-18", "Man Utd U-18"], ["Manchester City W", "Man City W"], ["Newcastle United", "Newcastle Utd"],
    ["Leeds United", "Leeds Utd"], ["Wigan Athletic", "Wigan Ath"], ["AFC Telford United", "AFC Telford Utd"],
    ["Sekhukhune United U23", "Sekhukhune Utd U23"], ["Saint-Étienne", "St-Étienne"], ["Saint Mirren", "St Mirren"],
    ["Paris Saint-Germain", "Paris St-Germain"], ["Manchester", "Manchester"], ["Manchester SC", "Manchester SC"],
  ]) assert.equal(shortTeamName(name), expected, name);
});

test("whitespace collapses and a non-empty name never shortens to nothing", () => {
  assert.equal(shortTeamName("  Real   Madrid \n"), "Real Madrid");
  assert.equal(shortTeamName("Leeds  United"), "Leeds Utd");
  assert.equal(shortTeamName("Café FC"), "Café FC");
  assert.equal(shortTeamName(""), "");
  for (const name of ["FC", "F.C.", "W", "II", "1. FC", "FC W", "United", "Saint"]) assert.ok(shortTeamName(name).length > 0, name);
});

test("codes are accepted only as 2–5 letters or digits", () => {
  for (const [code, expected] of [["MUN", "MUN"], [" ars ", "ARS"], ["LAFC", "LAFC"], ["B04", "B04"], ["AB", "AB"], ["ABCDE", "ABCDE"],
    ["A", null], ["ABCDEF", null], ["M-U", null], ["MÜN", null], ["", null], [null, null], [undefined, null],
    // Only ASCII before uppercasing: "ß" and "ı" uppercase to ASCII letters but are not codes.
    ["ßß", null], ["ıst", null], ["\tlfc\n", "LFC"], ["M U", null], ["１２３", null], [123, null], [{}, null]]) {
    assert.equal(validTeamCode(code), expected, String(code));
  }
});

test("candidates run full name, code, shortened name, without duplicates", () => {
  assert.deepEqual(teamDisplayCandidates("Manchester United", "MUN"), ["Manchester United", "MUN", "Man Utd"]);
  assert.deepEqual(teamDisplayCandidates("Manchester United", null), ["Manchester United", "Man Utd"]);
  assert.deepEqual(teamDisplayCandidates("Manchester  United", "x"), ["Manchester United", "Man Utd"]);
  assert.deepEqual(teamDisplayCandidates("Los Angeles FC", "LAFC"), ["Los Angeles FC", "LAFC"]);
  assert.deepEqual(teamDisplayCandidates("Arsenal FC"), ["Arsenal FC"]);
  assert.deepEqual(teamDisplayCandidates("PSG", "psg"), ["PSG"]);
  assert.ok(Object.isFrozen(teamDisplayCandidates("Arsenal FC")));
});
