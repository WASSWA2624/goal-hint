import { z } from "zod";
import { getReportingDate, utcInstantFromEpochMilliseconds } from "./calendar.ts";
import { parseSlipCriteria, serializeSlipCriteria } from "./slip-builder.ts";

export const slipConfigurationRules = Object.freeze({ maximum: 10, nameLength: 60, parameterBytes: 2048, requestBytes: 8192 });
const name = z.string().trim().min(1).max(slipConfigurationRules.nameLength)
  .refine(value => !/\p{Cc}/u.test(value), "Use a plain configuration name.").transform(value => value.normalize("NFC"));
export const slipConfigurationIdSchema = z.uuid();
const id = slipConfigurationIdSchema;
const revision = z.number().int().positive().max(2_147_483_647);
const parameters = z.string().min(1).max(slipConfigurationRules.parameterBytes);

/** Store only validated, canonical filters. Generation and UI navigation flags never belong to a configuration. */
export function canonicalSlipConfigurationParameters(value: string, today = getReportingDate(utcInstantFromEpochMilliseconds(Date.now()))): string {
  if (value.length > slipConfigurationRules.parameterBytes) throw new RangeError("Configuration is too large.");
  const query = new URLSearchParams(value);
  if (query.has("build") || query.has("configuration")) throw new RangeError("Save filters without generation flags.");
  return serializeSlipCriteria(parseSlipCriteria(query, today)).toString();
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

/** A load URL always fills the builder, including when the source page contains generated slips. */
export function slipConfigurationHref(configuration: Pick<SlipConfiguration, "id" | "parameters">, locale: string): string {
  const query = new URLSearchParams(canonicalSlipConfigurationParameters(configuration.parameters));
  query.set("configuration", id.parse(configuration.id));
  return `/${locale}/slips?${query}`;
}
