import assert from "node:assert/strict";
import test from "node:test";
import { footballSearchScore, footballSearchTiers, normalizeFootballSearch, prepareFootballSearch } from "../src/domain/football-search.ts";

const exact = footballSearchTiers.exact;
const isSimilar = (score) => score > 0 && score < exact;
const character = (code) => String.fromCodePoint(code);

test("misspellings, established abbreviations and reordered words find Manchester United", () => {
  for (const query of ["Machester United", "Man United", "United Manchester", "Mankheste Unitited", "Man Utd", "M.U.F.C.", "manutd", "Man Utd FC",
    "Mchster Untd", "Manchestre Unitde", "Mnchstr Utd"]) {
    assert.ok(footballSearchScore(query, "Manchester United") > 0, query);
    assert.equal(footballSearchScore(query, "Manchester City"), 0, query);
    assert.equal(footballSearchScore(query, "Leeds United"), 0, query);
    assert.equal(footballSearchScore(query, "Newcastle United"), 0, query);
  }
});

test("the requested examples rank aliases and reordered words as exact and abbreviations as similar", () => {
  assert.ok(footballSearchScore("Man United", "Manchester United") >= exact);
  assert.ok(footballSearchScore("United Manchester", "Manchester United") >= exact);
  assert.ok(isSimilar(footballSearchScore("Mchster Untd", "Manchester United")));
  assert.ok(footballSearchScore("Man United", "Manchester United") > footballSearchScore("United Manchester", "Manchester United"));
  assert.ok(footballSearchScore("United Manchester", "Manchester United") > footballSearchScore("Mchster Untd", "Manchester United"));
});

test("exact names precede aliases, reordered words, prefixes and bounded spelling matches", () => {
  const query = prepareFootballSearch("Manchester United");
  const candidates = ["Manchester Unitid", "United Manchester", "Manchester United Women", "Manchester Utd", "Manchester United"];
  const ordered = candidates.map((name, index) => ({ name, index, score: query.score(name) }))
    .sort((left, right) => right.score - left.score || left.index - right.index);
  assert.deepEqual(ordered.map(({ name }) => name), ["Manchester United", "Manchester Utd", "United Manchester", "Manchester United Women", "Manchester Unitid"]);
  assert.equal(query.score("Manchester United"), 1000);
  assert.ok(footballSearchScore("Manch United", "Manchester United") > footballSearchScore("Mankheste Unitited", "Manchester United"));
});

test("direct matches and corrected matches fall on either side of the exact tier", () => {
  for (const [query, candidate] of [["Manchester United", "Manchester United"], ["Man Utd", "Manchester United"], ["United Manchester", "Manchester United"],
    ["ManchesterUnited", "Manchester United"], ["Manchester", "Manchester City"], ["Manch United", "Manchester United"], ["prem leag", "Premier League"]]) {
    assert.ok(footballSearchScore(query, candidate) >= exact, `${query}: ${candidate}`);
  }
  for (const [query, candidate] of [["Manchester Unitid", "Manchester United"], ["Chelsae", "Chelsea"], ["chester United", "Manchester United"],
    ["Mchster Untd", "Manchester United"], ["Barcelona Madrid", "Barcelona"]]) {
    assert.ok(isSimilar(footballSearchScore(query, candidate)), `${query}: ${candidate}`);
  }
});

test("case, accents, punctuation, invisible formatting and international names normalize without erasing non-Latin scripts", () => {
  assert.equal(normalizeFootballSearch("  SÃO—PAULO!  "), "sao paulo");
  assert.equal(normalizeFootballSearch(`Man${character(0xad)}chester${character(0x200b)} United`), "manchester united");
  assert.equal(normalizeFootballSearch(`ＭＡＮ${character(0x3000)}ＵＴＤ`), "man utd");
  for (const [query, candidate] of [["sao paulo", "São Paulo"], ["KOLN", "Köln"], ["Strasse", "Straße"],
    ["St. Étienne", "Saint-Etienne"], ["O Higgins", "O-Higgins"], ["OHiggins", "O’Higgins"],
    ["U.S.A.", "United States"], ["Dynamo Kyiv", "Dynamo-Kyiv"], ["Dynamo Kiev", "Dynamo Kyiv"], ["東京ヴェルディ", "東京ヴェルディ"],
    ["Москва Динамо", "Динамо Москва"], ["Paris Saint Germain", "Paris Saint-Germain"], ["Besiktas", "Beşiktaş"]]) {
    assert.ok(footballSearchScore(query, candidate) > 0, `${query}: ${candidate}`);
  }
  assert.equal(footballSearchScore("東京ヴェルディ", "Manchester United"), 0);
});

test("numbers keep their value: locale grouping is removed, decimals stay whole and neighbours never match", () => {
  assert.equal(normalizeFootballSearch("10,000"), "10000");
  assert.equal(normalizeFootballSearch(`10${character(0xa0)}000`), "10000");
  assert.equal(normalizeFootballSearch(`10${character(0x202f)}000`), "10000");
  assert.equal(normalizeFootballSearch("10’000"), "10000");
  assert.equal(normalizeFootballSearch("1,234,567.50"), "1234567.5");
  assert.equal(normalizeFootballSearch("2.50 goals"), "2.5 goals");
  assert.equal(normalizeFootballSearch("1,5"), "1 5", "an English comma between 1 and 5 is not a thousands separator");
  assert.equal(normalizeFootballSearch("10.000"), "10", "an English decimal point keeps the value ten");
  assert.equal(normalizeFootballSearch("10.000", "de"), "10000");
  assert.equal(normalizeFootballSearch("1,5", "de"), "1.5");
  assert.equal(normalizeFootballSearch(`${character(0x661)}${character(0x660)}`), "10");
  assert.equal(normalizeFootballSearch("2. Bundesliga"), "2 bundesliga");
  assert.equal(footballSearchScore("10,000", "Club 10000"), 970);
  assert.equal(footballSearchScore("10000", "Club 10,000"), 970);
  assert.equal(footballSearchScore("10,000", "Club 10"), 0);
  assert.equal(footballSearchScore("1,5", "Club 15"), 0);
  assert.equal(footballSearchScore("10.000", "Club 10000"), 0);
  assert.equal(footballSearchScore("10.000", "Club 10000", "de"), 970);
});

test("team, competition and country aliases share the same scorer", () => {
  for (const [query, candidate] of [["PSG", "Paris Saint Germain"], ["Spurs", "Tottenham Hotspur"],
    ["BVB", "Borussia Dortmund"], ["Wolves", "Wolverhampton Wanderers"], ["Barça", "Barcelona"],
    ["Bayern Munich", "Bayern München"], ["Inter Milan", "Internazionale"], ["EPL", "Premier League"],
    ["UCL", "UEFA Champions League"], ["USA", "United States of America"], ["UAE", "United Arab Emirates"],
    ["Côte d’Ivoire", "Ivory Coast"], ["Czech Republic", "Czechia"], ["Türkiye", "Turkey"], ["Athletic Bilbao", "Athletic Club"]]) {
    assert.ok(footballSearchScore(query, candidate) >= 940, `${query}: ${candidate}`);
    assert.ok(footballSearchScore(candidate, query) >= 940, `${candidate}: ${query}`);
  }
});

test("nicknames, demonyms and local competition words read descriptive queries", () => {
  assert.equal(footballSearchScore("red devils", "Manchester United"), 970);
  assert.equal(footballSearchScore("the gunners", "Arsenal"), 970);
  assert.equal(footballSearchScore("Uganda Cranes", "Uganda"), 970);
  assert.ok(footballSearchScore("english premier league", "Premier League England") >= exact);
  assert.ok(footballSearchScore("german cup", "DFB Pokal Germany") >= exact);
  assert.ok(footballSearchScore("spanish league", "La Liga Spain") >= exact);
  assert.ok(footballSearchScore("arsenal women", "Arsenal W") >= exact);
  assert.equal(footballSearchScore("league", "Legia Warszawa"), 0, "alternate forms never take spelling corrections");
});

test("descriptive sentences drop filler and keep each named team", () => {
  assert.equal(footballSearchScore("show me manchester united matches today", "Manchester United"), 970);
  assert.equal(footballSearchScore("Serie A", "Serie A"), 1000, "a final letter is part of the name");
  assert.deepEqual(prepareFootballSearch("Arsenal vs Chelsea").tokens, ["arsenal", "chelsea"]);
  assert.deepEqual(prepareFootballSearch("Flamengo x Vasco").tokens, ["flamengo", "vasco"]);
  const fixture = prepareFootballSearch("who wins Arsenal v Chelsea tonight");
  const home = fixture.match("Arsenal"), away = fixture.match("Chelsea");
  assert.ok(home && away && (home.covered | away.covered) === 2 ** fixture.tokens.length - 1, "home and away cover the query together");
  assert.ok(isSimilar(fixture.score("Arsenal")) && isSimilar(fixture.score("Chelsea")), "either team alone is a similar result");
  const spurs = prepareFootballSearch("spurs vs arsenal");
  assert.ok(isSimilar(spurs.score("Arsenal")) && isSimilar(spurs.score("Tottenham Hotspur Women")));
});

test("a partial mention stands only beside another named team, never by dropping a qualifier", () => {
  for (const [query, candidate] of [["Barcelona Madrid", "Barcelona"], ["Barcelona Madrid", "Real Madrid"], ["Manchester Arsenal", "Manchester United"],
    ["Barcelona Real Madrid", "Barcelona"]]) {
    assert.ok(isSimilar(footballSearchScore(query, candidate)), `${query}: ${candidate}`);
  }
  const united = prepareFootballSearch("Manchester United");
  assert.ok(united.match("Manchester SC"), "the mention still counts towards a fixture");
  assert.equal(united.score("Manchester SC"), 0);
  assert.equal(united.match("Manchester City"), null, "City is no mention of United");
  assert.equal(prepareFootballSearch("League 1").match("League 2"), null);
  const psg = prepareFootballSearch("psg");
  assert.equal(psg.match("Paris FC"), null, "an alias names one team");
  assert.equal(psg.match("Germany"), null);
  const english = prepareFootballSearch("english premier league");
  assert.equal(english.score("Premier League"), 0, "another country's Premier League needs England too");
  assert.equal(english.score("England"), 0);
  assert.equal((english.match("Premier League").covered | english.match("England").covered), 2 ** english.tokens.length - 1);
});

test("word prefixes, adjacent transpositions and full names work across identity types", () => {
  for (const [query, candidate] of [["prem leag", "Premier League"], ["Champions Leauge", "UEFA Champions League"],
    ["Ugnada", "Uganda"], ["Fuhlam", "Fulham"], ["Manchster United", "Manchester United"],
    ["ManchesterUnited", "Manchester United"], ["Man chester United", "Manchester United"],
    ["Barcelona", "FC Barcelona"], ["UEFA CL", "UEFA Champions League"], ["Juventis", "Juventus"], ["Tottenam Hotspur", "Tottenham Hotspur"]]) {
    assert.ok(footballSearchScore(query, candidate) > 0, `${query}: ${candidate}`);
  }
});

test("spelling tolerance grows with word length and falls back to abbreviations and consonant outlines", () => {
  assert.ok(isSimilar(footballSearchScore("Arsnal", "Arsenal")), "one missing letter");
  assert.ok(isSimilar(footballSearchScore("Arsenaal", "Arsenal")), "one extra letter");
  assert.ok(isSimilar(footballSearchScore("Arsenel", "Arsenal")), "one wrong letter");
  assert.ok(isSimilar(footballSearchScore("Rasenal", "Arsenal")), "one swapped pair");
  assert.ok(isSimilar(footballSearchScore("Manchestre", "Manchester")), "two slips in a long word");
  assert.ok(isSimilar(footballSearchScore("Mnachestr", "Manchester")), "three slips in a long word");
  assert.ok(isSimilar(footballSearchScore("Untd", "United")), "abbreviation");
  assert.ok(isSimilar(footballSearchScore("Gelitisirey", "Galatasaray")), "vowel slips beyond the edit limit");
  for (const [query, candidate] of [["Leeds", "Lewes"], ["Porto", "Prato"], ["Madrid", "Mardin"], ["United", "Unter Flockenbach"],
    ["Manchester", "Chichester City"], ["Manchester", "Lancaster City"], ["rice", "Nice"], ["Arsnal", "Aral"], ["kyiv", "Kulykiv"],
    ["Juventus", "Juve Stabia"], ["paris", "Aris"]]) {
    assert.equal(footballSearchScore(query, candidate), 0, `${query}: ${candidate}`);
  }
});

test("meaningful literal word fragments retain substring search below prefix relevance", () => {
  assert.ok(footballSearchScore("chester United", "Manchester United") > 0);
  assert.ok(footballSearchScore("nited", "United") > 0);
  assert.ok(footballSearchScore("club", "Synthetic SuperClub") > 0);
  assert.ok(footballSearchScore("nited", "Nited United") > footballSearchScore("nited", "United"));
  assert.ok(footballSearchScore("chester", "Chesterfield") > footballSearchScore("chester", "Manchester"));
  assert.ok(isSimilar(footballSearchScore("Man United", "Fettehman United")), "an inner fragment is never exact");
  for (const [query, candidate] of [["he", "Manchester"], ["ite", "UnitedStatesOfAmerica"], ["%_!", "Manchester United"],
    ["39", "Club 3901"], ["901", "3901"], ["U21", "SuperU21"], ["chester Arsenal", "Manchester United"]]) {
    assert.equal(footballSearchScore(query, candidate), 0, `${query}: ${candidate}`);
  }
});

test("short queries, numeric identifiers and missing substantive words remain precise", () => {
  for (const [query, candidate] of [["ma", "Manchester United"], ["man", "Milan"], ["MU", "Manchester United"],
    ["3901", "3902"], ["U21", "U23"], ["League 1", "League 2"], ["United Zimbabwe", "Manchester United"],
    ["Chelsea", "Manchester United"], ["Mankheste Unitited", "Leeds United"], ["Zzzzzzz", "Zimbabwe"], ["39", "Club 3901"]]) {
    assert.equal(footballSearchScore(query, candidate), 0, `${query}: ${candidate}`);
  }
  assert.ok(footballSearchScore("man", "Manchester United") > 0);
  assert.equal(footballSearchScore("3901", "3901"), 1000);
  assert.equal(footballSearchScore("Li", "Li"), 1000);
});

const names = ["Manchester United", "Manchester City", "Manchester United U21", "Leeds United", "Newcastle United", "West Ham United",
  "Arsenal", "Arsenal W", "Chelsea", "Liverpool", "Tottenham Hotspur", "Everton", "Fulham", "Brighton", "Real Madrid", "Real Sociedad",
  "Real Betis", "Atletico Madrid", "Barcelona", "Sevilla", "Bayern München", "Borussia Dortmund", "Juventus", "Juve Stabia", "Internazionale",
  "Milan", "Napoli", "Roma", "Lazio", "Paris Saint Germain", "Paris FC", "Marseille", "Lyon", "Nice", "Ajax", "PSV Eindhoven", "Benfica",
  "Porto", "Sporting CP", "Galatasaray", "Fenerbahçe", "Celtic", "Rangers", "Al Ahly", "Kaizer Chiefs", "Vipers", "KCCA", "Gor Mahia",
  "Uganda", "England", "Spain", "Germany", "Premier League", "La Liga", "Serie A", "Bundesliga", "Ligue 1", "UEFA Champions League",
  "Copa Libertadores", "FA Cup", "Championship", "Major League Soccer", "Club 10000"];
const ranked = (query) => {
  const search = prepareFootballSearch(query);
  return names.map((name) => ({ name, score: search.score(name) })).filter(({ score }) => score > 0);
};

test("ambiguous queries keep every exact candidate in the exact tier", () => {
  const manchester = ranked("Manchester");
  for (const name of ["Manchester United", "Manchester City", "Manchester United U21"]) {
    assert.ok(manchester.find((hit) => hit.name === name)?.score >= exact, name);
  }
  const united = ranked("United").map(({ name }) => name).sort();
  assert.deepEqual(united, ["Leeds United", "Manchester United", "Manchester United U21", "Newcastle United", "West Ham United"]);
  assert.deepEqual(ranked("Real").filter(({ score }) => score >= exact).map(({ name }) => name).sort(), ["Real Betis", "Real Madrid", "Real Sociedad"]);
  assert.deepEqual(ranked("Paris").map(({ name }) => name).sort(), ["Paris FC", "Paris Saint Germain"]);
});

test("unrelated searches return nothing rather than a forced suggestion", () => {
  for (const query of ["xylophone quantum", "pizza delivery", "how to cook rice", "weather tomorrow", "qwertyuiop", "the", "!!!", "123456789"]) {
    assert.deepEqual(ranked(query), [], query);
  }
});

test("club-word-only queries retain literal matches without accepting spelling alternatives", () => {
  assert.deepEqual(prepareFootballSearch("club").tokens, ["club"]);
  assert.ok(footballSearchScore("club", "Synthetic Club 3901") > 0);
  assert.ok(footballSearchScore("FC", "FC Barcelona") > 0);
  assert.ok(footballSearchScore("club", "Clubhouse United") > 0);
  assert.equal(footballSearchScore("club", "Clue United"), 0);
  assert.equal(footballSearchScore("FC", "AC Barcelona"), 0);
  assert.equal(footballSearchScore("La Liga", "Liga"), 970, "name articles never decide a match");
});

test("the exact senior team outranks its age-group counterpart for every requested query", () => {
  for (const query of ["Manchester United", "Machester United", "Man United", "United Manchester", "Mankheste Unitited", "Mchster Untd"]) {
    const search = prepareFootballSearch(query);
    assert.ok(search.score("Manchester United U21") > 0, query);
    assert.ok(search.score("Manchester United") > search.score("Manchester United U21"), query);
    assert.equal(search.score("Newcastle United"), 0, query);
    assert.equal(search.score("Manchester City"), 0, query);
  }
});

test("distinct query words cannot reuse a single candidate word, and repeated words do not inflate relevance", () => {
  assert.ok(footballSearchScore("Manch Manchester", "Manchester United") < exact);
  const repeated = footballSearchScore("Manchester United United", "Manchester United");
  assert.ok(repeated > 0 && repeated <= footballSearchScore("Manchester United", "Manchester United"));
  assert.ok(footballSearchScore("man manc", "Manchester Mancini") > 0);
  assert.ok(footballSearchScore("zaaaaaaaaa zbbaaaaaaa zbbbbaaaaa zbbbbbbaaa",
    "zaaaaaaaaa zbbaaaaaaa zbbbbaaaaa zaaaaaaabb") > 0, "a complete spelling assignment beats an incomplete exact assignment");
});

test("a long list of teams keeps its first sixteen words and still finds the teams it names", () => {
  const search = prepareFootballSearch("arsenal chelsea liverpool spurs man city man united newcastle aston villa brighton west ham everton wolves fulham");
  assert.equal(search.tokens.length, 16);
  assert.ok(isSimilar(search.score("Arsenal")) && isSimilar(search.score("Everton")));
  assert.equal(search.match("Fulham"), null, "words past the sixteenth are not searched");
});

test("empty, punctuation-only and excessive inputs reject candidates without wildcard behavior", () => {
  for (const query of ["", "  ", "%_!", "---", "x".repeat(513)]) {
    assert.equal(footballSearchScore(query, "Manchester United"), 0, query.slice(0, 20));
  }
  assert.equal(footballSearchScore("Manchester United", ""), 0);
  assert.equal(footballSearchScore("Manchester United", "x".repeat(513)), 0);
  for (const value of ["constructor", "toString", "hasOwnProperty", "__proto__"]) {
    assert.equal(footballSearchScore(value, "Manchester United"), 0, value);
  }
});

test("prepared scorers are immutable, deterministic and independent across searches", () => {
  const united = prepareFootballSearch("Man United"), city = prepareFootballSearch("Man City");
  assert.ok(Object.isFrozen(united));
  assert.ok(Object.isFrozen(united.tokens));
  assert.ok(Object.isFrozen(united.match("Manchester United")));
  assert.equal(united.normalized, "man united");
  assert.deepEqual(united.tokens, ["manchester", "united"]);
  assert.equal(united.distinctive, 0b01, "Manchester identifies a team; United alone does not");
  const expected = united.score("Manchester United");
  for (let index = 0; index < 300; index++) united.score(`Unrelated ${index}`);
  assert.equal(united.score("Manchester United"), expected);
  assert.equal(united.score("Manchester City"), 0);
  assert.equal(city.score("Manchester United"), 0);
  assert.ok(city.score("Manchester City") > 0);
});
