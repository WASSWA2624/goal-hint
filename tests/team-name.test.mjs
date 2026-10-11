import assert from "node:assert/strict";
import test from "node:test";
import { abbreviationSlotEm, abbreviationWidthEm, cardTeamAbbreviations, teamAbbreviation, tightAbbreviationScale, validTeamCode }
  from "../src/domain/team-name.ts";

const expectAll = (pairs) => { for (const [name, expected] of pairs) assert.equal(teamAbbreviation(name), expected, String(name)); };

test("the documented examples derive as specified", () => {
  expectAll([["Real Madrid", "RMA"], ["Atletico Tucuman", "ATU"], ["Platense FC", "PLA"], ["Juticalpa", "JUT"], ["Boca Juniors", "BOC"],
    ["Arsenal", "ARS"], ["Liverpool", "LIV"], ["Leeds", "LEE"], ["Sunderland", "SUN"], ["Ajax", "AJA"], ["PSV Eindhoven", "PSV"],
    ["Celtic", "CEL"], ["Rangers", "RAN"], ["Anderlecht", "AND"], ["Bayern München", "BAY"], ["Inter", "INT"]]);
});

test("accents are stripped and letters that do not decompose are transliterated", () => {
  expectAll([["Fenerbahçe", "FEN"], ["1. FC Köln", "KOL"], ["Malmö FF", "MAL"], ["Bodø/Glimt", "BOD"], ["Łódź", "LOD"],
    ["Brøndby IF", "BRO"], ["Lech Poznań", "LEC"], ["Śląsk Wrocław U19", "SLA"], ["Ağrı 1970", "AGR"], ["Æbelø", "AEB"]]);
  for (const name of ["Fenerbahçe", "Bodø/Glimt", "Łódź", "Ağrı 1970", "São Paulo"]) assert.match(teamAbbreviation(name), /^[A-Z0-9]{3}$/u, name);
});

test("club tokens, qualifiers, linking words, lone initials and numbers are ignored", () => {
  expectAll([["AC Milan", "MIL"], ["SL Benfica", "BEN"], ["AS Roma", "ROM"], ["SSC Napoli", "NAP"], ["VfB Stuttgart", "STU"],
    ["F.C. Porto", "POR"], ["HNK Hajduk Split", "HAJ"], ["Chelsea FC Women", "CHE"], ["Arsenal W", "ARS"], ["Brazil U20", "BRA"],
    ["Flamengo Sub-20", "FLA"], ["Manchester United U-18", "MAN"], ["Barcelona B", "BAR"], ["Hertha BSC II", "HER"],
    ["Liverpool FC Reserves", "LIV"], ["UD Las Palmas", "PAL"], ["Queen of the South", "QUE"], ["Le Havre", "HAV"],
    ["Al-Nassr", "NAS"], ["Al-Hilal Saudi FC", "HIL"], ["Newell's Old Boys", "NEW"], ["Côte d'Ivoire", "COT"],
    ["A. Italiano", "ITA"], ["CF Os Belenenses", "BEL"], ["Bayer 04 Leverkusen", "BAY"], ["TSV 1860 München", "MUN"]]);
});

test("a common prefix takes its initial plus two letters of the next word", () => {
  expectAll([["Sporting CP", "SCP"], ["Sporting Gijón", "SGI"], ["Real Sociedad", "RSO"], ["Atlético Madrid", "AMA"],
    ["Deportivo La Coruña", "DCO"], ["Olympique Marseille", "OMA"], ["Borussia Dortmund", "BDO"], ["Dynamo Kyiv", "DKY"],
    ["GNK Dinamo Zagreb", "DZA"], ["1. FC Union Berlin", "UBE"], ["Unión Santa Fe", "USA"], ["Inter Miami", "IMI"],
    ["Racing Club", "RCL"], ["Club Brugge KV", "CBR"], ["Saint-Étienne", "SET"], ["St. Pauli", "SPA"], ["São Paulo", "SPA"],
    ["Maccabi Haifa", "MHA"], ["Hapoel Haifa", "HHA"], ["Universidad de Chile", "UCH"], ["Real", "REA"], ["Sporting", "SPO"]]);
});

test("short names fill from the next word or the name's numbers, and empty names have no abbreviation", () => {
  expectAll([["AZ Alkmaar", "AZA"], ["B 93", "B93"], ["TP-47", "TP4"], ["FC 105", "FC1"], ["FC", "FC"], ["F.C.", "FC"],
    ["B36 Tórshavn", "B36"], ["Os", "OS"], ["3K", "3K"], ["皇家马德里", "皇家马"], ["", ""], ["   ", ""], [null, ""], [undefined, ""], ["⚽", ""]]);
  assert.equal(teamAbbreviation("  real   MADRID \n"), "RMA");
});

test("cards keep valid provider codes and ignore invalid ones", () => {
  assert.deepEqual(cardTeamAbbreviations({ name: "Manchester United", code: "MUN" }, { name: "Liverpool", code: " liv " }), { home: "MUN", away: "LIV" });
  assert.deepEqual(cardTeamAbbreviations({ name: "Paris Saint Germain", code: "PSG" }, { name: "Olympique Marseille", code: null }), { home: "PSG", away: "OMA" });
  assert.deepEqual(cardTeamAbbreviations({ name: "Real Madrid", code: "R-M" }, { name: "Barcelona", code: "ABCDEF" }), { home: "RMA", away: "BAR" });
  assert.deepEqual(cardTeamAbbreviations({ name: null }, { name: "Arsenal" }), { home: "", away: "ARS" });
  assert.deepEqual(cardTeamAbbreviations({ name: "" }, { name: "  " }), { home: "", away: "" });
});

test("the two labels of one card always differ", () => {
  for (const [home, away, expected] of [
    [{ name: "Manchester United" }, { name: "Manchester City" }, ["MUN", "MCI"]],
    [{ name: "Sheffield United" }, { name: "Sheffield Wednesday" }, ["SUN", "SWE"]],
    [{ name: "Bayer Leverkusen" }, { name: "Bayern München" }, ["BLE", "BMU"]],
    [{ name: "Stade Rennais" }, { name: "Stade de Reims" }, ["REN", "REI"]],
    [{ name: "Real Madrid" }, { name: "Real Madrid Castilla" }, ["RMA", "RMC"]],
    [{ name: "Boca Juniors" }, { name: "Bocholt" }, ["BJU", "BOC"]],
    [{ name: "CSKA Moscow" }, { name: "CSKA Sofia" }, ["CMO", "CSO"]],
    // A side with a code keeps it; only the derived side moves.
    [{ name: "Manchester United" }, { name: "Mansfield", code: "MAN" }, ["MUN", "MAN"]],
    [{ name: "Arsenal", code: "ARS" }, { name: "Arsenal Tula" }, ["ARS", "ATU"]],
    // Identical codes (a data error) still separate.
    [{ name: "Arsenal", code: "ARS" }, { name: "Arsenal Tula", code: "ARS" }, ["ARS", "AR2"]],
    [{ name: "AB" }, { name: "AB" }, ["AB", "AB2"]],
  ]) assert.deepEqual(Object.values(cardTeamAbbreviations(home, away)), expected, `${home.name} v ${away.name}`);
  const { home, away } = cardTeamAbbreviations({ name: "Juventus" }, { name: "Juventus" });
  assert.notEqual(home, away);
  // Every pair from a broad sample, including near-identical names, separates deterministically.
  const names = ["Arsenal", "Arsenal Tula", "Arsenal Kyiv", "Manchester United", "Manchester City", "Mansfield", "Mainz", "Malmö FF",
    "Marseille", "Inter", "Internacional", "Inter Miami", "Al Ahly", "Al Ahli", "Al Ain", "Real Madrid", "Real Betis", "Racing Club",
    "Bocholt", "Boca Juniors", "Bochum", "Stade Rennais", "Stade de Reims", "Stade Brestois", "Sporting CP", "Sporting Gijón",
    "Wolverhampton Wanderers", "Wolfsburg", "Wolves", "AB", "Os", "B 93", "FC", "Partizan", "Partizani", "Juventus", "Juventus W"];
  for (const left of names) for (const right of names) {
    const labels = cardTeamAbbreviations({ name: left }, { name: right });
    assert.notEqual(labels.home, labels.away, `${left} v ${right}`);
    assert.deepEqual(cardTeamAbbreviations({ name: left }, { name: right }), labels);
  }
});

test("codes are accepted only as 2–5 letters or digits", () => {
  for (const [code, expected] of [["MUN", "MUN"], [" ars ", "ARS"], ["LAFC", "LAFC"], ["B04", "B04"], ["AB", "AB"], ["ABCDE", "ABCDE"],
    ["A", null], ["ABCDEF", null], ["M-U", null], ["MÜN", null], ["", null], [null, null], [undefined, null],
    // Only ASCII before uppercasing: "ß" and "ı" uppercase to ASCII letters but are not codes.
    ["ßß", null], ["ıst", null], ["\tlfc\n", "LFC"], ["M U", null], ["１２３", null], [123, null], [{}, null]]) {
    assert.equal(validTeamCode(code), expected, String(code));
  }
});

test("label widths decide the tight type, which fits every W-heavy derived abbreviation in its slot", () => {
  // Manrope Bold advances: ARS 2.0em, MUN 2.29em, RWW 2.61em (the widest of the 5,251 stored names).
  assert.ok(Math.abs(abbreviationWidthEm("ARS") - 1.989) < 0.001);
  for (const label of ["ARS", "MUN", "LIV", "BAR", "B04", "—"]) assert.ok(abbreviationWidthEm(label) <= abbreviationSlotEm, label);
  for (const label of ["RWW", "WOH", "MUM", "MWO", "AMM", "LAFC"]) {
    assert.ok(abbreviationWidthEm(label) > abbreviationSlotEm, label);
    assert.ok(abbreviationWidthEm(label) * tightAbbreviationScale <= abbreviationSlotEm, label);
  }
  assert.ok(abbreviationWidthEm("皇家马") > abbreviationSlotEm);
});
