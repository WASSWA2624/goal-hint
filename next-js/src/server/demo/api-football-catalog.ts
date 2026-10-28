import "server-only";

/** Synthetic identities deliberately use a separate range from the live provider catalog.
 * Country/competition names provide familiar context; fixtures and clubs are invented. */
export const DEMO_START_DATE = "2026-01-01";
export const DEMO_END_DATE = "2026-11-30";
export const DEMO_MATCHES_PER_DAY = 560;
export const DEMO_DAY_MS = 86_400_000;
export const DEMO_START_MS = Date.parse(`${DEMO_START_DATE}T00:00:00Z`);
export const DEMO_DAYS = Math.floor((Date.parse(`${DEMO_END_DATE}T00:00:00Z`) - DEMO_START_MS) / DEMO_DAY_MS) + 1;
export const DEMO_FIXTURE_ID_BASE = 900_000_000;

export type DemoVenue = Readonly<{ id: number; name: string; address: string; city: string;
  capacity: number; surface: string; image: string }>;
export type DemoTeam = Readonly<{ id: number; name: string; code: string; country: string;
  national: false; logo: string; founded: number; venue: DemoVenue; index: number; leagueId: number }>;
export type DemoLeague = Readonly<{ id: number; name: string; country: string; countryCode: string;
  type: "League" | "Cup"; index: number; teams: readonly DemoTeam[] }>;

// Sixty clubs in three rotating cohorts give every club two rest days between fixtures.
// Each cohort uses a complete circle-method round robin with alternating home/away legs.
const specifications = [
  ["England", "gb", "Premier League", "London,Manchester,Liverpool,Leeds,Newcastle,Bristol,Nottingham,Brighton,Sheffield,Southampton"],
  ["Spain", "es", "La Liga", "Madrid,Barcelona,Seville,Valencia,Bilbao,Vigo,Granada,Cadiz,Malaga,Valladolid"],
  ["Germany", "de", "Bundesliga", "Berlin,Munich,Hamburg,Cologne,Leipzig,Bremen,Frankfurt,Dresden,Mainz,Freiburg"],
  ["France", "fr", "Ligue 1", "Paris,Lyon,Marseille,Lille,Nantes,Nice,Rennes,Toulouse,Strasbourg,Lens"],
  ["Italy", "it", "Serie A", "Rome,Milan,Naples,Turin,Genoa,Florence,Bologna,Verona,Parma,Lecce"],
  ["Netherlands", "nl", "Eredivisie", "Amsterdam,Rotterdam,Eindhoven,Utrecht,Arnhem,Twente,Groningen,Breda,Alkmaar,Zwolle"],
  ["Portugal", "pt", "Primeira Liga", "Lisbon,Porto,Braga,Coimbra,Faro,Funchal,Setubal,Aveiro,Leiria,Guimaraes"],
  ["Belgium", "be", "Pro League", "Brussels,Bruges,Antwerp,Ghent,Liege,Genk,Charleroi,Mechelen,Leuven,Mons"],
  ["Scotland", "gb-sct", "Premiership", "Glasgow,Edinburgh,Aberdeen,Dundee,Perth,Inverness,Paisley,Kilmarnock,Stirling,Hamilton"],
  ["Turkey", "tr", "Super Lig", "Istanbul,Ankara,Izmir,Antalya,Trabzon,Bursa,Konya,Sivas,Kayseri,Samsun"],
  ["Greece", "gr", "National Cup", "Athens,Thessaloniki,Patras,Heraklion,Larissa,Volos,Ioannina,Chania,Serres,Kavala"],
  ["Switzerland", "ch", "Super League", "Zurich,Basel,Bern,Geneva,Lausanne,Lucerne,Lugano,Sion,Winterthur,St Gallen"],
  ["Austria", "at", "Bundesliga", "Vienna,Salzburg,Graz,Linz,Innsbruck,Klagenfurt,Villach,Wels,St Polten,Altach"],
  ["Denmark", "dk", "Superliga", "Copenhagen,Aarhus,Odense,Aalborg,Esbjerg,Randers,Horsens,Viborg,Silkeborg,Vejle"],
  ["Norway", "no", "Eliteserien", "Oslo,Bergen,Trondheim,Stavanger,Tromso,Bodo,Molde,Skien,Kristiansand,Fredrikstad"],
  ["Sweden", "se", "Allsvenskan", "Stockholm,Gothenburg,Malmo,Uppsala,Linkoping,Helsingborg,Orebro,Norrkoping,Kalmar,Boras"],
  ["Poland", "pl", "Ekstraklasa", "Warsaw,Krakow,Gdansk,Poznan,Wroclaw,Lodz,Lublin,Szczecin,Katowice,Bialystok"],
  ["Czech Republic", "cz", "First League", "Prague,Brno,Ostrava,Plzen,Liberec,Olomouc,Zlin,Teplice,Pardubice,Jablonec"],
  ["Croatia", "hr", "HNL", "Zagreb,Split,Rijeka,Osijek,Zadar,Pula,Sibenik,Varazdin,Koprivnica,Gorica"],
  ["Serbia", "rs", "Super Liga", "Belgrade,Novi Sad,Nis,Kragujevac,Subotica,Cacak,Kraljevo,Krusevac,Pancevo,Uzice"],
  ["Romania", "ro", "Liga I", "Bucharest,Cluj,Timisoara,Craiova,Constanta,Iasi,Brasov,Sibiu,Oradea,Ploiesti"],
  ["Hungary", "hu", "National Cup", "Budapest,Debrecen,Szeged,Miskolc,Pecs,Gyor,Kecskemet,Sopron,Fehervar,Kaposvar"],
  ["Ukraine", "ua", "Premier League", "Kyiv,Lviv,Odesa,Kharkiv,Dnipro,Poltava,Rivne,Lutsk,Cherkasy,Uzhhorod"],
  ["Ireland", "ie", "Premier Division", "Dublin,Cork,Limerick,Galway,Waterford,Dundalk,Drogheda,Sligo,Derry,Athlone"],
  ["Finland", "fi", "Veikkausliiga", "Helsinki,Tampere,Turku,Oulu,Espoo,Lahti,Kuopio,Vaasa,Kotka,Seinajoki"],
  ["Iceland", "is", "Besta Deild", "Reykjavik,Kopavogur,Hafnarfjordur,Akureyri,Keflavik,Akranes,Selfoss,Gardabaer,Mosfellsbaer,Isafjordur"],
  ["USA", "us", "Major League Soccer", "Seattle,Portland,Miami,Austin,Denver,Chicago,Atlanta,Boston,Orlando,Nashville"],
  ["Mexico", "mx", "Liga MX", "Mexico City,Guadalajara,Monterrey,Puebla,Toluca,Leon,Tijuana,Queretaro,Morelia,Merida"],
  ["Canada", "ca", "Premier League", "Toronto,Vancouver,Montreal,Calgary,Ottawa,Halifax,Hamilton,Winnipeg,Victoria,Edmonton"],
  ["Costa Rica", "cr", "Primera Division", "San Jose,Alajuela,Heredia,Cartago,Limon,Puntarenas,Liberia,Grecia,Nicoya,San Carlos"],
  ["Brazil", "br", "Serie A", "Rio de Janeiro,Sao Paulo,Salvador,Recife,Fortaleza,Curitiba,Santos,Belem,Goiania,Belo Horizonte"],
  ["Argentina", "ar", "Liga Profesional", "Buenos Aires,Rosario,Cordoba,Mendoza,La Plata,Santa Fe,Tucuman,Salta,Mar del Plata,Lanus"],
  ["Chile", "cl", "National Cup", "Santiago,Valparaiso,Concepcion,Antofagasta,Temuco,Iquique,La Serena,Rancagua,Talca,Puerto Montt"],
  ["Colombia", "co", "Primera A", "Bogota,Medellin,Cali,Barranquilla,Cartagena,Pereira,Manizales,Pasto,Ibague,Bucaramanga"],
  ["Uruguay", "uy", "Primera Division", "Montevideo,Salto,Paysandu,Maldonado,Rivera,Las Piedras,Rocha,Colonia,Artigas,Mercedes"],
  ["Peru", "pe", "Primera Division", "Lima,Arequipa,Cusco,Trujillo,Chiclayo,Piura,Huancayo,Iquitos,Tacna,Cajamarca"],
  ["Ecuador", "ec", "Liga Pro", "Quito,Guayaquil,Cuenca,Ambato,Manta,Loja,Riobamba,Machala,Ibarra,Latacunga"],
  ["Japan", "jp", "J1 League", "Tokyo,Osaka,Yokohama,Kobe,Kyoto,Nagoya,Sapporo,Fukuoka,Hiroshima,Sendai"],
  ["South Korea", "kr", "K League 1", "Seoul,Busan,Incheon,Daegu,Daejeon,Suwon,Jeonju,Ulsan,Gwangju,Jeju"],
  ["China", "cn", "Super League", "Beijing,Shanghai,Guangzhou,Chengdu,Wuhan,Nanjing,Shenzhen,Tianjin,Qingdao,Dalian"],
  ["Australia", "au", "A-League", "Sydney,Melbourne,Brisbane,Perth,Adelaide,Newcastle,Canberra,Geelong,Wollongong,Gosford"],
  ["New Zealand", "nz", "National League", "Auckland,Wellington,Christchurch,Hamilton,Dunedin,Tauranga,Nelson,Napier,Rotorua,Palmerston"],
  ["India", "in", "Super League", "Mumbai,Delhi,Kolkata,Chennai,Bengaluru,Kochi,Hyderabad,Pune,Guwahati,Goa"],
  ["Thailand", "th", "National Cup", "Bangkok,Chiang Mai,Phuket,Khon Kaen,Chonburi,Rayong,Buriram,Trang,Sukhothai,Chiang Rai"],
  ["Saudi Arabia", "sa", "Pro League", "Riyadh,Jeddah,Dammam,Mecca,Medina,Taif,Abha,Tabuk,Buraidah,Al Khobar"],
  ["United Arab Emirates", "ae", "Pro League", "Dubai,Abu Dhabi,Sharjah,Al Ain,Ajman,Fujairah,Ras Al Khaimah,Kalba,Khor Fakkan,Hatta"],
  ["Qatar", "qa", "Stars League", "Doha,Al Rayyan,Al Wakrah,Al Khor,Lusail,Dukhan,Mesaieed,Umm Salal,Al Shamal,Al Daayen"],
  ["Morocco", "ma", "Botola Pro", "Casablanca,Rabat,Marrakesh,Fez,Tangier,Agadir,Meknes,Oujda,Tetouan,Safi"],
  ["Egypt", "eg", "Premier League", "Cairo,Alexandria,Giza,Port Said,Suez,Ismailia,Aswan,Luxor,Mansoura,Tanta"],
  ["Tunisia", "tn", "Ligue 1", "Tunis,Sfax,Sousse,Kairouan,Bizerte,Gabes,Monastir,Nabeul,Gafsa,Beja"],
  ["Algeria", "dz", "Ligue 1", "Algiers,Oran,Constantine,Annaba,Setif,Blida,Tlemcen,Bejaia,Biskra,Batna"],
  ["South Africa", "za", "Premiership", "Johannesburg,Cape Town,Durban,Pretoria,Soweto,Bloemfontein,Polokwane,Gqeberha,Mbombela,Kimberley"],
  ["Nigeria", "ng", "Premier League", "Lagos,Abuja,Kano,Ibadan,Enugu,Port Harcourt,Benin City,Kaduna,Jos,Aba"],
  ["Ghana", "gh", "Premier League", "Accra,Kumasi,Tamale,Takoradi,Cape Coast,Tema,Sunyani,Koforidua,Ho,Obuasi"],
  ["Kenya", "ke", "Premier League", "Nairobi,Mombasa,Kisumu,Nakuru,Eldoret,Thika,Nyeri,Kakamega,Kitale,Machakos"],
  ["Uganda", "ug", "National Cup", "Kampala,Entebbe,Jinja,Gulu,Mbarara,Mbale,Fort Portal,Arua,Masaka,Lira"],
] as const;

const suffixes = ["City", "United", "Athletic", "Rovers", "Sporting", "Wanderers"] as const;
const teamRows: DemoTeam[] = [];
const leagues: DemoLeague[] = specifications.map(([country, countryCode, name, places], index) => {
  const cities = places.split(","), leagueId = 700_001 + index;
  const teams = Array.from({ length: 60 }, (_, teamIndex): DemoTeam => {
    const city = cities[teamIndex % cities.length]!, id = 800_000 + index * 60 + teamIndex;
    const clubName = `${city} ${suffixes[Math.floor(teamIndex / cities.length)]!}`;
    // Real, publicly served country flags are reliable demo placeholders without inventing live club branding.
    const logo = `https://media.api-sports.io/flags/${countryCode}.svg`;
    return Object.freeze({ id, name: clubName,
      code: `${city.replace(/[^A-Za-z]/gu, "").slice(0, 2)}${suffixes[Math.floor(teamIndex / cities.length)]![0]}`.toUpperCase(),
      country, national: false, logo, founded: 1880 + (index * 7 + teamIndex * 3) % 130,
      venue: Object.freeze({ id: 2_000_000 + index * 60 + teamIndex, name: `${clubName} Stadium`,
        address: `${10 + teamIndex} Stadium Road`, city, capacity: 6_000 + (index * 919 + teamIndex * 1_297) % 72_000,
        surface: teamIndex % 7 === 0 ? "artificial turf" : "grass", image: logo }), index: teamIndex, leagueId });
  });
  teamRows.push(...teams);
  return Object.freeze({ id: leagueId, name, country, countryCode, type: name === "National Cup" ? "Cup" : "League", index, teams: Object.freeze(teams) });
});
export const demoFootballCatalog = Object.freeze({ leagues: Object.freeze(leagues), teams: Object.freeze(teamRows) });
export const demoLeagueById = (id: number) => demoFootballCatalog.leagues[id - 700_001] ?? null;
export const demoTeamById = (id: number) => demoFootballCatalog.teams[id - 800_000] ?? null;
export const demoCountryFlag = (league: DemoLeague) => `https://media.api-sports.io/flags/${league.countryCode}.svg`;
export const demoRawTeam = (team: DemoTeam) => ({ id: team.id, name: team.name, logo: team.logo });
export const demoRawLeague = (league: DemoLeague) => ({ id: league.id, name: league.name, country: league.country,
  logo: demoCountryFlag(league), flag: demoCountryFlag(league), season: 2026 });

export function demoDateIndex(date: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) return null;
  const value = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(value) || new Date(value).toISOString().slice(0, 10) !== date) return null;
  const index = (value - DEMO_START_MS) / DEMO_DAY_MS;
  return Number.isInteger(index) && index >= 0 && index < DEMO_DAYS ? index : null;
}
export const demoDateAt = (index: number) => new Date(DEMO_START_MS + index * DEMO_DAY_MS).toISOString().slice(0, 10);
export function demoFixtureCoordinates(id: number): Readonly<{ day: number; slot: number }> | null {
  if (!Number.isSafeInteger(id)) return null;
  const value = id - DEMO_FIXTURE_ID_BASE, day = Math.floor(value / 1_000), slot = value % 1_000;
  return day >= 0 && day < DEMO_DAYS && slot >= 0 && slot < DEMO_MATCHES_PER_DAY ? { day, slot } : null;
}
export function demoFixtureTeams(day: number, slot: number) {
  const league = leagues[Math.floor(slot / 10)]!, pair = slot % 10, round = Math.floor(day / 3) % 19;
  const cohort = day % 3, a = pair === 0 ? 19 : (round + pair) % 19;
  const b = pair === 0 ? round : (round - pair + 19) % 19;
  const reverse = (Math.floor(day / 3) + pair) % 2 === 1;
  return { league, home: league.teams[cohort * 20 + (reverse ? b : a)]!, away: league.teams[cohort * 20 + (reverse ? a : b)]! };
}
/** Integer hashing is reproducible across Node processes, reloads and generator calls. */
export function demoHash(seed: number, salt = 0): number {
  let value = Math.imul(seed ^ salt, 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return (value ^ (value >>> 16)) >>> 0;
}
