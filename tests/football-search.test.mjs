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

test("a partial mention is a similar result when it covers a distinctive word, never a crossing between sibling clubs", () => {
  for (const [query, candidate] of [["Barcelona Madrid", "Barcelona"], ["Barcelona Madrid", "Real Madrid"], ["Manchester Arsenal", "Manchester United"],
    ["Barcelona Real Madrid", "Barcelona"], ["Leeds United", "Leeds"], ["Newcastle United", "Newcastle"], ["Olympique de Marseille", "Marseille"],
    ["North Macedonia", "Macedonia"]]) {
    assert.ok(isSimilar(footballSearchScore(query, candidate)), `${query}: ${candidate}`);
  }
  const united = prepareFootballSearch("Manchester United");
  assert.ok(isSimilar(united.score("Manchester SC")), "a short stored name is a similar result");
  assert.equal(united.score("Racing United"), 0, "a qualifier alone never stands");
  assert.equal(united.match("Manchester City"), null, "City is no mention of United");
  assert.equal(prepareFootballSearch("League 1").match("League 2"), null);
  const psg = prepareFootballSearch("psg");
  assert.equal(psg.match("Paris FC"), null, "an alias names one team");
  assert.equal(psg.match("Germany"), null);
  const english = prepareFootballSearch("english premier league");
  assert.equal(english.score("Premier League"), 0, "another country's Premier League needs England too");
  assert.ok(isSimilar(english.score("England")));
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

// Stored names as the provider writes them, and the words a query names across all of them (as the feed and lists do).
const stored = ["Manchester United", "Manchester City", "Newcastle United", "Leeds United", "Leicester City", "Paris Saint Germain",
  "Paris FC", "PSG U19", "USA W", "Singida Black Stars", "Ghana", "MLS Next Pro", "AC Milan", "FK Partizan", "FK Rabotnicki",
  "RB Leipzig", "Bayern München", "Hammarby FF", "Kalmar FF", "Vasco DA Gama", "Flamengo", "Reading", "Arsenal", "Arsenal U19",
  "Sparta Praha", "Slavia Praha", "Internacional", "Gremio", "Orgryte IS", "Landvetter IS", "All Boys", "Team Altamura",
  "Serie A", "Serie B", "NB I", "NB II", "Athletic Club", "Charlton Athletic", "Real Madrid", "Real Sociedad", "South Africa",
  "1º de Agosto", "Tau Altopascio", "Thor Akureyri U19", "Costa-Rica", "Manchester SC", "Germany", "USA", "Mexico", "England",
  "England W", "Palmeiras U20", "AS Roma", "La Liga", "Liga II", "III Liga - Group 1", "Real Madrid II", "Real Madrid III",
  "Tercera División RFEF - Group 2", "Division 2", "Serie C - Girone A", "Inter", "Inter Milano W", "Inter Miami", "Tottenham",
  "Wolves", "Boca Juniors", "Racing Club", "Leeds", "Marseille", "Chelsea", "Chelsea W", "Arsenal W", "Frauen Bundesliga",
  "Chelsea U21", "1a Divisão - Women", "2. Bundesliga", "L'Hospitalet", "L'Aquila", "Inter Club d'Escaldes", "Manchester City U19"];
// Fixture rule as in feed-read: names together cover every word (exact when all matched directly), or one anchors a distinctive word.
function fixture(query, home, away) {
  const { search } = across(query), named = stored.reduce((bits, name) => bits | (search.match(name)?.named ?? 0), 0);
  const distinctive = search.distinctive | search.ambiguous & named, full = 2 ** search.tokens.length - 1;
  const parts = [search.match(home), search.match(away)], covered = parts.reduce((bits, part) => bits | (part?.covered ?? 0), 0);
  const direct = parts.reduce((bits, part) => bits | (part?.direct ?? 0), 0);
  return covered !== full && (covered & distinctive) === 0 ? "missing" : direct === full ? "exact" : "similar";
}
function across(query) {
  const search = prepareFootballSearch(query);
  const named = stored.reduce((bits, name) => bits | (search.match(name)?.named ?? 0), 0);
  return { search, score: (name) => search.score(name, named), covered: (name) => search.match(name)?.covered ?? 0 };
}

test("two named teams are both found, whether written as aliases, with club forms or with extra name words", () => {
  for (const [query, home, away] of [["Man Utd vs Man City", "Manchester United", "Manchester City"],
    ["Man Utd vs Newcastle United", "Manchester United", "Newcastle United"], ["Man Utd vs Leeds Utd", "Manchester United", "Leeds United"],
    ["Man City vs Leicester City", "Manchester City", "Leicester City"], ["PSG vs Paris FC", "Paris Saint Germain", "Paris FC"],
    ["Partizan vs Rabotnicki", "FK Partizan", "FK Rabotnicki"], ["Leipzig vs Bayern", "RB Leipzig", "Bayern München"],
    ["Hammarby vs Kalmar", "Hammarby FF", "Kalmar FF"], ["Flamengo x Vasco", "Flamengo", "Vasco DA Gama"],
    ["Orgryte vs Landvetter", "Orgryte IS", "Landvetter IS"], ["Reading vs Arsenal", "Reading", "Arsenal"],
    ["Sparta Praha vs Slavia Praha", "Sparta Praha", "Slavia Praha"], ["Internacional vs Gremio", "Internacional", "Gremio"]]) {
    const { search, score, covered } = across(query);
    assert.ok(score(home) > 0 && score(away) > 0, `${query}: ${score(home)} / ${score(away)}`);
    assert.equal(covered(home) | covered(away), 2 ** search.tokens.length - 1, `${query}: together they cover the query`);
  }
  assert.equal(across("psg").search.match("Paris FC"), null, "an alias still names one team");
  assert.equal(across("psg").search.match("Germany"), null);
  assert.equal(across("Inter vs Milan").search.tokens.join(" "), "inter milan", "two teams never join into one alias");
});

test("qualifiers stay qualifiers: abbreviations and half-typed words never cross City and United", () => {
  for (const [query, wanted, other] of [["Manchester Cty", "Manchester City", "Manchester United"], ["Manchester Un", "Manchester United", "Manchester City"],
    ["Manchester Ci", "Manchester City", "Manchester United"], ["Manchester U", "Manchester United", "Manchester City"],
    ["Mankheste Unitited", "Manchester United", "Manchester City"], ["Manchester Unitd", "Manchester United", "Manchester City"]]) {
    const { score } = across(query);
    assert.ok(score(wanted) > 0, `${query}: ${wanted}`);
    assert.equal(score(other), 0, `${query}: ${other}`);
  }
  assert.ok(across("Manchester Unitd").score("Manchester SC") < exact, "a short stored name is at most similar");
  assert.equal(across("how to cook rice").score("Costa-Rica"), 0, "a corrected word cannot carry a name's other words");
});

test("half-typed last words keep their results while typing", () => {
  for (const [query, name] of [["Real M", "Real Madrid"], ["South A", "South Africa"], ["AC Mi", "AC Milan"], ["Bayern M", "Bayern München"]]) {
    assert.ok(across(query).score(name) >= exact, `${query}: ${name}`);
  }
  assert.equal(across("Real M").score("Real Sociedad"), 0);
});

test("names containing aliases, nicknames or filler stay findable in sentences", () => {
  for (const [query, name] of [["show me PSG U19 matches", "PSG U19"], ["show me USA W matches", "USA W"],
    ["show me singida black stars matches", "Singida Black Stars"], ["MLS Next Pro matches", "MLS Next Pro"]]) {
    const { score } = across(query);
    assert.ok(score(name) >= exact, `${query}: ${name}`);
  }
  assert.ok(across("show me singida black stars matches").score("Singida Black Stars") > across("show me singida black stars matches").score("Ghana"));
  for (const [query, name] of [["All Boys vs Chacarita", "All Boys"], ["Team Altamura vs Bari", "Team Altamura"]]) {
    assert.ok(across(query).score(name) > 0, `${query}: ${name}`);
  }
  const serie = across("Serie A matches"), nb = across("NB I matches");
  assert.ok(serie.score("Serie A") >= exact && serie.score("Serie B") === 0, "a final letter survives trailing filler");
  assert.ok(nb.score("NB I") > nb.score("NB II"), "Roman numerals never drift");
  assert.ok(across("I want to see arsenal").score("Arsenal") >= exact);
  const athletic = across("Athletic Bilbao");
  assert.ok(athletic.score("Athletic Club") >= 940 && athletic.score("Charlton Athletic") === 0);
});

test("age groups, ordinals and initials normalize consistently", () => {
  for (const query of ["Arsenal U-19", "Arsenal U 19", "Arsenal U.19", "Arsenal Under 19"]) {
    assert.ok(across(query).score("Arsenal U19") >= exact, query);
  }
  for (const query of ["1 de Agosto", "1° de Agosto"]) assert.ok(across(query).score("1º de Agosto") >= exact, query);
  const tau = across("tau");
  assert.ok(tau.score("Tau Altopascio") > tau.score("Thor Akureyri U19"), "age groups spell no acronym");
  assert.equal(normalizeFootballSearch(`10${character(0x66c)}000`), "10000");
  assert.equal(normalizeFootballSearch(`10${character(0x66b)}5`), "10.5");
  assert.equal(normalizeFootballSearch("10 000", "fr"), "10000", "plain spaces group thousands where the locale groups with spaces");
  assert.equal(normalizeFootballSearch("10 000"), "10 000");
  assert.equal(normalizeFootballSearch(`Arsenal${character(0x3164)}`), "arsenal");
  assert.equal(normalizeFootballSearch("ΟΛΥΜΠΙΑΚΟΣ"), normalizeFootballSearch("ολυμπιακοσ"));
});

test("each side of 'X vs Y' is read on its own: aliases, nicknames, qualifiers and the US", () => {
  for (const [query, home, away] of [["Mexico vs US", "Mexico", "USA"], ["England v US", "England", "USA"], ["Inter vs Milan", "Inter", "AC Milan"],
    ["Boca vs Racing", "Boca Juniors", "Racing Club"], ["wolves vs arsenal", "Wolves", "Arsenal"], ["chelsea women's vs arsenal women's", "Chelsea W", "Arsenal W"]]) {
    assert.equal(fixture(query, home, away), "exact", query);
  }
  assert.notEqual(fixture("chelsea vs leeds united", "Chelsea", "Leeds"), "missing", "a short stored name still answers its side");
  assert.ok(across("Inter vs Milan").score("Inter Milano W") < exact, "one name never answers both sides");
  const us = across("US W");
  assert.ok(us.score("USA W") >= exact && us.score("England W") === 0, "US before a qualifier is still the United States");
  assert.equal(across("US U20").score("Palmeiras U20"), 0);
  assert.ok(across("Singida Black Stars").score("Singida Black Stars") >= exact && across("Singida Black Stars").score("Ghana") === 0,
    "a nickname inside a longer name stays literal");
  assert.ok(across("black stars").score("Ghana") >= exact);
});

test("divisions, numerals and half-typed letters never drift to a neighbouring competition in the exact tier", () => {
  for (const [query, wrong] of [["Liga II", "III Liga - Group 1"], ["real madrid ii", "Real Madrid III"], ["Division 2", "Tercera División RFEF - Group 2"],
    ["Serie A", "Serie C - Girone A"], ["Manchester U", "Manchester City U19"]]) {
    assert.ok(across(query).score(wrong) < exact, `${query}: ${wrong}`);
  }
  assert.ok(across("Serie A").score("Serie A") >= exact && across("Division 2").score("Division 2") >= exact);
});

test("stored spellings meet everyday ones: short forms, women's teams, plural age groups, ordinals, elisions and joined words", () => {
  for (const [query, name] of [["spurs", "Tottenham"], ["Inter Milan", "Inter"], ["inter milan women", "Inter Milano W"],
    ["chelsea women's", "Chelsea W"], ["england ladies", "England W"], ["womens bundesliga", "Frauen Bundesliga"],
    ["Chelsea U21s", "Chelsea U21"], ["arsenal under-19s", "Arsenal U19"], ["1ª divisão", "1a Divisão - Women"], ["2nd bundesliga", "2. Bundesliga"],
    ["1o de agosto", "1º de Agosto"], ["hospitalet", "L'Hospitalet"], ["aquila", "L'Aquila"], ["Escaldes", "Inter Club d'Escaldes"],
    ["ACMilan", "AC Milan"], ["ASRoma", "AS Roma"], ["LaLiga", "La Liga"], ["BayernMünchen", "Bayern München"], ["arsenal matchs tomorow", "Arsenal"]]) {
    assert.ok(across(query).score(name) > 0, `${query}: ${name}`);
  }
  assert.ok(across("Inter").score("Inter Miami") >= exact, "a stored short form never narrows the query");
  assert.equal(across("ManchesterUtd").score("Manchester City"), 0, "a run-on word is no spelling slip");
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
  assert.equal(prepareFootballSearch("Manchester United").distinctive, 0b01, "Manchester identifies a team; United alone does not");
  assert.equal(united.distinctive, 0b11, "an expanded alias names its team with every word");
  const expected = united.score("Manchester United");
  for (let index = 0; index < 300; index++) united.score(`Unrelated ${index}`);
  assert.equal(united.score("Manchester United"), expected);
  assert.equal(united.score("Manchester City"), 0);
  assert.equal(city.score("Manchester United"), 0);
  assert.ok(city.score("Manchester City") > 0);
});
