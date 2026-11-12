import { z } from "zod";
import { getReportingDate, utcInstantFromEpochMilliseconds, type ReportingDate } from "./calendar.ts";
import { parseSlipCriteria, serializeSlipCriteria, type SlipCriteria } from "./slip-builder.ts";
import { fullDayKickoffTime } from "./kickoff-time.ts";
import { formatOddsHundredths, oddsRules } from "./odds.ts";

export const slipConfigurationRules = Object.freeze({ maximum: 10, nameLength: 60, parameterBytes: 2048, requestBytes: 8192 });
const name = z.string().trim().min(1).max(slipConfigurationRules.nameLength)
  .refine(value => !/\p{Cc}/u.test(value), "Use a plain configuration name.").transform(value => value.normalize("NFC"));
export const slipConfigurationIdSchema = z.uuid();
const id = slipConfigurationIdSchema;
const revision = z.number().int().positive().max(2_147_483_647);
const parameters = z.string().min(1).max(slipConfigurationRules.parameterBytes);

function normalizeSlipConfigurationParameters(value: string, today: string, stored: boolean): string {
  if (value.length > slipConfigurationRules.parameterBytes) throw new RangeError("Configuration is too large.");
  const query = new URLSearchParams(value);
  if (query.has("build") || query.has("configuration")) throw new RangeError("Save filters without generation flags.");
  // Older rows omit dates. A continuous interval explicitly supplies both endpoints and a zone.
  if (!["start", "end", "tz"].some(key => query.has(key))) {
    query.delete("dateFrom"); query.delete("dateTo");
  }
  if (stored) {
    for (const field of ["totalMin", "totalMax", "oddsMin", "oddsMax"]) {
      const [bound, duplicate] = query.getAll(field);
      if (!bound || duplicate !== undefined) continue;
      const match = /^(0|[1-9]\d{0,13})(?:\.(\d{1,2}))?$/u.exec(bound);
      if (!match) continue;
      const hundredths = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
      if (hundredths > 0 && hundredths < oddsRules.minimumHundredths) {
        query.set(field, formatOddsHundredths(oddsRules.minimumHundredths));
      }
    }
  }
  const criteria = parseSlipCriteria(query, today);
  if (criteria.interval) return serializeSlipCriteria(criteria).toString();
  const saved = serializeSlipCriteria({ ...criteria, timeFrom: criteria.timeFrom || fullDayKickoffTime.from,
    timeTo: criteria.timeTo || fullDayKickoffTime.to });
  saved.delete("dateFrom"); saved.delete("dateTo");
  return saved.toString();
}

/** Exact date-time filters retain both endpoints. Legacy parameters retain their reusable clock times. */
export function canonicalSlipConfigurationParameters(value: string, today = getReportingDate(utcInstantFromEpochMilliseconds(Date.now()))): string {
  return normalizeSlipConfigurationParameters(value, today, false);
}

/** Read older saved bounds with the current minimum, keeping blank maxima unrestricted. */
export function storedSlipConfigurationParameters(value: string, today = getReportingDate(utcInstantFromEpochMilliseconds(Date.now()))): string {
  return normalizeSlipConfigurationParameters(value, today, true);
}

export const slipConfigurationMutationSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("create"), name, parameters, isDefault: z.boolean() }),
  z.strictObject({ action: z.literal("rename"), id, revision, name }),
  z.strictObject({ action: z.literal("update"), id, revision, parameters }),
  z.strictObject({ action: z.literal("default"), id, revision, isDefault: z.boolean() }),
  z.strictObject({ action: z.literal("delete"), id, revision }),
]);
export type SlipConfigurationMutation = z.infer<typeof slipConfigurationMutationSchema>;
export const slipConfigurationSchema = z.strictObject({ id, name, parameters, revision, isDefault: z.boolean(),
  createdAt: z.iso.datetime(), updatedAt: z.iso.datetime() });
export type SlipConfiguration = z.infer<typeof slipConfigurationSchema>;
export const slipConfigurationsSchema = z.strictObject({ configurations: z.array(slipConfigurationSchema).max(slipConfigurationRules.maximum) });
export type SlipConfigurations = z.infer<typeof slipConfigurationsSchema>;
export type SlipConfigurationFailure = "forbidden" | "limit" | "name-taken" | "not-found" | "conflict" | "invalid";

/** Decode saved filters, giving time-only presets the supplied current date. */
export function slipConfigurationCriteria(parameters: string,
  today = getReportingDate(utcInstantFromEpochMilliseconds(Date.now()))): SlipCriteria {
  return parseSlipCriteria(new URLSearchParams(storedSlipConfigurationParameters(parameters, today)), today);
}

/** Give a legacy preset today's continuous range for this application without changing its stored values. */
export function datedSlipConfiguration(configuration: SlipConfiguration, today: ReportingDate, zone: string): SlipConfiguration {
  const query = new URLSearchParams(storedSlipConfigurationParameters(configuration.parameters, today));
  if (query.has("start")) return configuration;
  query.set("start", `${today}T${query.get("timeFrom") ?? fullDayKickoffTime.from}`);
  query.set("end", `${today}T${query.get("timeTo") ?? fullDayKickoffTime.to}`);
  query.set("tz", zone);
  query.delete("timeFrom"); query.delete("timeTo");
  return { ...configuration, parameters: canonicalSlipConfigurationParameters(query.toString(), today) };
}

/** Loading fills the Builder without generation. Date-free presets use today's date. */
export function slipConfigurationHref(configuration: Pick<SlipConfiguration, "id" | "parameters">, locale: string,
  today = getReportingDate(utcInstantFromEpochMilliseconds(Date.now()))): string {
  const query = new URLSearchParams(storedSlipConfigurationParameters(configuration.parameters, today));
  if (!query.has("start")) {
    query.set("dateFrom", today); query.set("dateTo", today);
  }
  query.set("configuration", id.parse(configuration.id));
  return `/${locale}/slips?${query}`;
}
