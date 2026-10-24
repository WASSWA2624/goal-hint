import { getCountries, getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/mobile";
import metadata from "libphonenumber-js/metadata.mobile.json";
import { iso31661 } from "iso-3166";
import { normalizePhone, phoneInputMaxLength } from "./phone.ts";

export type PhoneCountry = Readonly<{ iso2: CountryCode; iso3: string; name: string; callingCode: string; flag: string | null }>;
export type PhoneValueParts = Readonly<{ country: CountryCode | null; callingCode: string; national: string }>;

const isoCountries = new Map(iso31661.map(country => [country.alpha2, country]));
const familiarNames: Readonly<Partial<Record<CountryCode, string>>> = {
  GB: "United Kingdom", US: "United States", KR: "South Korea", KP: "North Korea", RU: "Russia", TZ: "Tanzania",
  AC: "Ascension Island", TA: "Tristan da Cunha",
};
export const phoneCountries: readonly PhoneCountry[] = Object.freeze(getCountries().map(iso2 => {
  const standard = isoCountries.get(iso2);
  return Object.freeze({ iso2, iso3: standard?.alpha3 ?? "", name: familiarNames[iso2] ?? standard?.name ?? (iso2 === "XK" ? "Kosovo" : iso2),
    callingCode: getCountryCallingCode(iso2), flag: `/flags/${iso2.toLowerCase()}.svg` });
}).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

const byCountry = new Map(phoneCountries.map(country => [country.iso2, country]));
const callingCodes = [...new Set(phoneCountries.map(country => country.callingCode))].sort((a, b) => b.length - a.length);
/** Each calling code's countries, main country first (`39`: Italy, then Vatican City). */
const mainCountries: Readonly<Record<string, readonly CountryCode[] | undefined>> = metadata.country_calling_codes;
const searchKey = (value: string) => value.normalize("NFKD").replace(/\p{M}+/gu, "").toLowerCase().replace(/[^a-z0-9]/gu, "");
const countryAliases: Readonly<Partial<Record<CountryCode, readonly string[]>>> = { AE: ["UAE"], CD: ["DRC"], GB: ["UK", "Britain"] };
const countrySearch = new Map(phoneCountries.map(country => {
  const aliases = countryAliases[country.iso2] ?? [];
  const exact = [country.iso2, country.iso3, country.callingCode, ...aliases].map(searchKey).filter(Boolean);
  return [country.iso2, { exact: new Set(exact), text: [country.name, isoCountries.get(country.iso2)?.name ?? "", ...exact].map(searchKey).join(" ") }];
}));

export function searchPhoneCountries(query: string): readonly PhoneCountry[] {
  const key = searchKey(query);
  if (!key) return phoneCountries;
  const exact: PhoneCountry[] = [], partial: PhoneCountry[] = [];
  for (const country of phoneCountries) {
    const index = countrySearch.get(country.iso2)!;
    if (index.exact.has(key)) exact.push(country);
    else if (index.text.includes(key)) partial.push(country);
  }
  return [...exact, ...partial];
}
export const phoneCountry = (iso2: CountryCode): PhoneCountry => byCountry.get(iso2)!;
const withoutSeparators = (value: string) => value.replace(/[\s\-.()[\]\u2010-\u2015\u2212]/gu, "");

/** Split an existing full value without imposing libphonenumber's stricter validation on the server's contract. */
export function splitPhoneValue(value: string, preferredCountry: CountryCode = "UG"): PhoneValueParts {
  const preferred = phoneCountry(preferredCountry);
  if (!value.trim() || value === preferred.callingCode) return { country: preferredCountry, callingCode: preferred.callingCode, national: "" };
  const canonical = normalizePhone(value);
  const digits = canonical ?? withoutSeparators(value).replace(/^(?:\+|00)/u, "");
  const parsed = canonical ? parsePhoneNumberFromString(`+${canonical}`, { extract: false }) : undefined;
  const callingCode = parsed?.countryCallingCode ?? callingCodes.find(code => digits.startsWith(code));
  if (callingCode) {
    // The metadata knows mobile numbers only, so a country is read from a valid mobile number, else the code's main country.
    const country = preferred.callingCode === callingCode ? preferredCountry
      : (parsed?.isValid() ? parsed.country : undefined) ?? mainCountries[callingCode]?.[0] ?? null;
    return { country, callingCode, national: digits.slice(callingCode.length) };
  }
  // Existing generic/non-geographic numbers still obey normalizePhone; do not reinterpret them as Ugandan numbers.
  return canonical ? { country: null, callingCode: "", national: canonical }
    : { country: preferredCountry, callingCode: preferred.callingCode, national: value };
}

/** Country metadata removes national trunk prefixes (while retaining significant zeros, such as Italy's). */
export function composePhoneValue(parts: PhoneValueParts): string {
  if (!parts.national.trim()) return "";
  const national = withoutSeparators(parts.national);
  if (!/^\d+$/u.test(national) || parts.national.length > phoneInputMaxLength) return `${parts.callingCode}${national}`;
  const parsed = parts.country ? parsePhoneNumberFromString(parts.national, { defaultCountry: parts.country, extract: false }) : undefined;
  const value = `${parts.callingCode}${parsed?.nationalNumber ?? national}`;
  return normalizePhone(value) ?? value;
}

/** Only explicit international input is inferred while typing; a national number must not change the chosen country. */
export function isInternationalPhoneInput(value: string): boolean {
  return /^\s*(?:\+|00)/u.test(value);
}
