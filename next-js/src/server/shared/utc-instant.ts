import "server-only";

import { z } from "zod";
import { utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";

/** Integer epoch milliseconds that map to a valid UTC instant with a four-digit year. */
export const fourDigitYearInstant = z.number().int().refine((value) => {
  try { utcInstantFromEpochMilliseconds(value); const year = new Date(value).getUTCFullYear(); return year >= 1000 && year <= 9999; }
  catch { return false; }
}).transform(utcInstantFromEpochMilliseconds);
