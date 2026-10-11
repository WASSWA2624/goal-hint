/**
 * Three-letter codes for competition countries, shown after the flag at the start of the phone match card's meta
 * line ("[flag] ENG · 13:30 · Premier League").
 *
 * Codes are FIFA trigrammes (ENG, ESP, ITA, GER, FRA, POR, NED, KSA, TUR, SCO, BEL…), the form football fans read on
 * scoreboards, rather than ISO 3166 (which has no England, Scotland, Wales or Northern Ireland and differs for
 * Germany, Spain, the Netherlands and others). API-Football's international competitions use the pseudo-country
 * "World", shown as INT. Names are matched case-insensitively with accents stripped and hyphens, spaces, apostrophes
 * and "&" treated alike, so the provider's "Saudi-Arabia", "Czech-Republic" and "Antigua-And-Barbuda" match, as do
 * common English variants ("Türkiye", "Czechia", "Korea Republic", "United States", "Côte d'Ivoire").
 *
 * A country missing from the table gets a derived code: the initials of a three-word name, the first letter plus the
 * first two of the next word for a two-word name, otherwise the first three letters (accents stripped, uppercase). A
 * name that is already two or three capital letters is kept as given. Empty or missing names have no code ("").
 */

const fifaCodes: Readonly<Record<string, string>> = {
  world: "INT",
  afghanistan: "AFG", albania: "ALB", algeria: "ALG", andorra: "AND", angola: "ANG", "antigua and barbuda": "ATG",
  argentina: "ARG", armenia: "ARM", aruba: "ARU", australia: "AUS", austria: "AUT", azerbaijan: "AZE", bahamas: "BAH",
  bahrain: "BHR", bangladesh: "BAN", barbados: "BRB", belarus: "BLR", belgium: "BEL", belize: "BLZ", benin: "BEN",
  bermuda: "BER", bhutan: "BHU", bolivia: "BOL", bosnia: "BIH", "bosnia and herzegovina": "BIH", botswana: "BOT",
  brazil: "BRA", brunei: "BRU", bulgaria: "BUL", "burkina faso": "BFA", burundi: "BDI", cambodia: "CAM",
  cameroon: "CMR", canada: "CAN", "cape verde": "CPV", "cape verde islands": "CPV", "cabo verde": "CPV",
  "central african republic": "CTA", chad: "CHA", chile: "CHI", china: "CHN", "chinese taipei": "TPE",
  colombia: "COL", comoros: "COM", congo: "CGO", "congo dr": "COD", "dr congo": "COD", "democratic republic of the congo": "COD",
  "costa rica": "CRC", croatia: "CRO", cuba: "CUB", curacao: "CUW", cyprus: "CYP", "czech republic": "CZE",
  czechia: "CZE", denmark: "DEN", djibouti: "DJI", dominica: "DMA", "dominican republic": "DOM", ecuador: "ECU",
  egypt: "EGY", "el salvador": "SLV", england: "ENG", "equatorial guinea": "EQG", eritrea: "ERI", estonia: "EST",
  eswatini: "SWZ", swaziland: "SWZ", ethiopia: "ETH", "faroe islands": "FRO", fiji: "FIJ", finland: "FIN",
  france: "FRA", gabon: "GAB", gambia: "GAM", georgia: "GEO", germany: "GER", ghana: "GHA", gibraltar: "GIB",
  greece: "GRE", grenada: "GRN", guadeloupe: "GLP", guam: "GUM", guatemala: "GUA", guinea: "GUI",
  "guinea bissau": "GNB", guyana: "GUY", haiti: "HAI", honduras: "HON", "hong kong": "HKG", hungary: "HUN",
  iceland: "ISL", india: "IND", indonesia: "IDN", iran: "IRN", iraq: "IRQ", ireland: "IRL",
  "republic of ireland": "IRL", israel: "ISR", italy: "ITA", "ivory coast": "CIV", "cote d ivoire": "CIV",
  jamaica: "JAM", japan: "JPN", jordan: "JOR", kazakhstan: "KAZ", kenya: "KEN", kosovo: "KVX", kuwait: "KUW",
  kyrgyzstan: "KGZ", laos: "LAO", latvia: "LVA", lebanon: "LBN", lesotho: "LES", liberia: "LBR", libya: "LBY",
  liechtenstein: "LIE", lithuania: "LTU", luxembourg: "LUX", macao: "MAC", macau: "MAC", macedonia: "MKD",
  "north macedonia": "MKD", madagascar: "MAD", malawi: "MWI", malaysia: "MAS", maldives: "MDV", mali: "MLI",
  malta: "MLT", martinique: "MTQ", mauritania: "MTN", mauritius: "MRI", mexico: "MEX", moldova: "MDA",
  mongolia: "MNG", montenegro: "MNE", morocco: "MAR", mozambique: "MOZ", myanmar: "MYA", namibia: "NAM",
  nepal: "NEP", netherlands: "NED", "new caledonia": "NCL", "new zealand": "NZL", nicaragua: "NCA", niger: "NIG",
  nigeria: "NGA", "north korea": "PRK", "korea dpr": "PRK", "northern ireland": "NIR", norway: "NOR", oman: "OMA",
  pakistan: "PAK", palestine: "PLE", panama: "PAN", "papua new guinea": "PNG", paraguay: "PAR", peru: "PER",
  philippines: "PHI", poland: "POL", portugal: "POR", "puerto rico": "PUR", qatar: "QAT", romania: "ROU",
  russia: "RUS", rwanda: "RWA", "saint kitts and nevis": "SKN", "saint lucia": "LCA",
  "saint vincent and the grenadines": "VIN", "san marino": "SMR", "saudi arabia": "KSA", scotland: "SCO",
  senegal: "SEN", serbia: "SRB", seychelles: "SEY", "sierra leone": "SLE", singapore: "SIN", slovakia: "SVK",
  slovenia: "SVN", "solomon islands": "SOL", somalia: "SOM", "south africa": "RSA", "south korea": "KOR",
  "korea republic": "KOR", "south sudan": "SSD", spain: "ESP", "sri lanka": "SRI", sudan: "SDN", suriname: "SUR",
  sweden: "SWE", switzerland: "SUI", syria: "SYR", tahiti: "TAH", tajikistan: "TJK", tanzania: "TAN",
  thailand: "THA", "timor leste": "TLS", togo: "TOG", "trinidad and tobago": "TRI", tunisia: "TUN", turkey: "TUR",
  turkiye: "TUR", turkmenistan: "TKM", uganda: "UGA", ukraine: "UKR", "united arab emirates": "UAE",
  uruguay: "URU", usa: "USA", "united states": "USA", "united states of america": "USA", uzbekistan: "UZB",
  vanuatu: "VAN", venezuela: "VEN", vietnam: "VIE", wales: "WAL", yemen: "YEM", zambia: "ZAM", zimbabwe: "ZIM",
};
const knownCodes = new Set(Object.values(fifaCodes));

/** Lowercase ASCII words: accents stripped; hyphens, apostrophes, "&" and other separators become single spaces. */
function key(name: string): string {
  return name.normalize("NFKD").replace(/\p{M}+/gu, "").toLowerCase().replace(/&/gu, " and ")
    .replace(/[^a-z0-9]+/gu, " ").trim();
}

/** A recognized country only; derived abbreviations must never select another country's flag. */
export function knownCountryCode(country: string | null | undefined): string {
  const name = typeof country === "string" ? country.trim() : "";
  const normalized = key(name);
  if (Object.hasOwn(fifaCodes, normalized)) return fifaCodes[normalized]!;
  return /^[A-Z]{3}$/u.test(name) && knownCodes.has(name) ? name : "";
}

/** The competition country's three-letter code (see the module rules); "" when there is no name. */
export function countryCode(country: string | null | undefined): string {
  const name = typeof country === "string" ? country.trim() : "";
  if (name === "") return "";
  if (/^[A-Z]{2,3}$/u.test(name)) return name;
  const words = key(name).split(" ").filter(Boolean);
  const known = Object.hasOwn(fifaCodes, words.join(" ")) ? fifaCodes[words.join(" ")] : undefined;
  if (known) return known;
  const significant = words.filter((word) => word !== "and" && word !== "of" && word !== "the");
  if (significant.length === 0) return "";
  const [first, second, third] = significant as [string, string?, string?];
  const derived = third ? first[0]! + second![0]! + third[0]! : second ? first[0]! + second.slice(0, 2) : first.slice(0, 3);
  return derived.toUpperCase();
}
