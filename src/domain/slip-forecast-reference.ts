import { z } from "zod";

export const slipForecastReferenceSchema = z.strictObject({ cycleId: z.uuid(), revisionId: z.uuid(), publishedAt: z.number().int().positive() });
/** Original published forecast, bound by the server before a slip is persisted. */
export type SlipForecastReference = Readonly<z.infer<typeof slipForecastReferenceSchema>>;
