import "server-only";
import { cache } from "react";
import { connection } from "next/server";
import { getReportingDate, utcInstantFromEpochMilliseconds } from "@/domain/calendar";

/** One request-scoped EAT date; never freeze Today in the production build. */
export const getShellInstant = cache(async () => {
  await connection();
  return utcInstantFromEpochMilliseconds(Date.now());
});
export const getShellDate = cache(async () => getReportingDate(await getShellInstant()));
