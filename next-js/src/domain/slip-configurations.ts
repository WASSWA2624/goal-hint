import { z } from "zod";
import { getReportingDate, utcInstantFromEpochMilliseconds } from "./calendar.ts";
import { parseSlipCriteria, serializeSlipCriteria, type SlipCriteria } from "./slip-builder.ts";
import { fullDayKickoffTime } from "./kickoff-time.ts";

export const slipConfigurationRules = Object.freeze({ maximum: 10, nameLength: 60, parameterBytes: 2048, requestBytes: 8192 });
const name = z.string().trim().min(1).max(slipConfigurationRules.nameLength)
  .refine(value => !/\p{Cc}/u.test(value), "Use a plain configuration name.").transform(value => value.normalize("NFC"));
export const slipConfigurationIdSchema = z.uuid();
const id = slipConfigurationIdSchema;
const revision = z.number().int().positive().max(2_147_483_647);
const parameters = z.string().min(1).max(slipConfigurationRules.parameterBytes);

/** Reusable filters retain time ranges, never dates or generation/navigation flags. Older dated saves normalize on read. */
export function canonicalSlipConfigurationParameters(value: string, today = getReportingDate(utcInstantFromEpochMilliseconds(Date.now()))): string {
  if (value.length > slipConfigurationRules.parameterBytes) throw new RangeError("Configuration is too large.");
  const query = new URLSearchParams(value);
  if (query.has("build") || query.has("configuration")) throw new RangeError("Save filters without generation flags.");
  query.delete("dateFrom"); query.delete("dateTo");
  const criteria = parseSlipCriteria(query, today);
  const saved = serializeSlipCriteria({ ...criteria, timeFrom: criteria.timeFrom || fullDayKickoffTime.from,
    timeTo: criteria.timeTo || fullDayKickoffTime.to });
  saved.delete("dateFrom"); saved.delete("dateTo");
  return saved.toString();
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

/** A fresh draft, independent of the generation result or the dates in an older save. */
export function slipConfigurationCriteria(parameters: string,
  today = getReportingDate(utcInstantFromEpochMilliseconds(Date.now()))): SlipCriteria {
  return parseSlipCriteria(new URLSearchParams(canonicalSlipConfigurationParameters(parameters, today)), today);
}

/** Loading fills today's filters without generation, even for legacy saves or an already-open builder from yesterday. */
export function slipConfigurationHref(configuration: Pick<SlipConfiguration, "id" | "parameters">, locale: string,
  today = getReportingDate(utcInstantFromEpochMilliseconds(Date.now()))): string {
  const query = new URLSearchParams(canonicalSlipConfigurationParameters(configuration.parameters, today));
  query.set("dateFrom", today); query.set("dateTo", today);
  query.set("configuration", id.parse(configuration.id));
  return `/${locale}/slips?${query}`;
}
