import "server-only";

import type { Clock } from "../../domain/calendar.ts";
import { buildSlips, type SlipCriteria } from "../../domain/slip-builder.ts";
import { getRuntimePolicy } from "../config/runtime-policy.ts";
import { getDatabase, type DatabaseRuntime } from "../database/client.ts";
import { createMysqlPublicSearchLimiter } from "../matches/search-limit.ts";
import { createSlipBuildService, type SlipJointModelBinding } from "./slip-service.ts";
import { boundJointSlipModel } from "./joint-model.ts";
import { createStoredSlipCohort } from "./slip-cohort.ts";

/** One bounded stored snapshot uses the match feed's exact scope, filters, order and public projections.
 * Database initialization stays lazy while the public odds feature is disabled. */
export function createStoredSlipBuild({ database, competitionIds, consume, jointModel = null }: Readonly<{
  database: () => DatabaseRuntime; competitionIds: () => readonly number[]; consume?: () => Promise<void>;
  jointModel?: SlipJointModelBinding | (() => SlipJointModelBinding | null) | null;
}>) {
  const readCohort = createStoredSlipCohort({ database, competitionIds });
  return function readStoredSlipBuild(criteria: SlipCriteria, clock?: Clock, locale = "en", build: typeof buildSlips = buildSlips) {
    return createSlipBuildService({ ...(clock ? { clock } : {}), ...(build !== buildSlips ? { build } : {}), jointModel,
      readCohort,
      consume: consume ?? (() => createMysqlPublicSearchLimiter(database()).consume()),
    }).query(criteria, locale);
  };
}

export const readPublicSlipBuild = createStoredSlipBuild({ database: getDatabase,
  competitionIds: () => getRuntimePolicy().choices.competitionIds ?? [], jointModel: boundJointSlipModel });
