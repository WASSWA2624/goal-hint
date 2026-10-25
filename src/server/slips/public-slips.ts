import "server-only";

import type { Clock } from "../../domain/calendar.ts";
import type { JointSlipModel } from "../../domain/joint-slips.ts";
import type { buildSlips, SlipCriteria } from "../../domain/slip-builder.ts";
import { getRuntimePolicy } from "../config/runtime-policy.ts";
import { getDatabase, type DatabaseRuntime } from "../database/client.ts";
import { createMatchFeedService } from "../matches/feed-service.ts";
import { createMysqlPublicSearchLimiter } from "../matches/search-limit.ts";
import { boundJointSlipModel } from "./joint-model.ts";
import { storedSlipPricePools } from "./price-read.ts";
import { createSlipBuildService } from "./slip-service.ts";

/** Server page reads use the same public stored projection and competition scope as the match feed.
 * Caches are omitted for this multi-page decision so every page uses its one pinned request clock.
 * Database initialization stays lazy while the public odds feature is disabled. Without an explicit
 * build, custom generation ranks by `jointModel` only when it is currently qualified. */
export function createStoredSlipBuild({ database, competitionIds, consume, jointModel }: Readonly<{
  database: () => DatabaseRuntime; competitionIds: () => readonly number[]; consume?: () => Promise<void>;
  jointModel?: () => JointSlipModel | null;
}>) {
  return function readStoredSlipBuild(criteria: SlipCriteria, clock?: Clock, locale = "en", build?: typeof buildSlips) {
    return createSlipBuildService({ ...(clock ? { clock } : {}), ...(build ? { build } : {}), ...(jointModel ? { jointModel } : {}),
      consume: consume ?? (() => createMysqlPublicSearchLimiter(database()).consume()),
      read: async (parameters, context, requestClock) => {
        const source = database();
        const feed = await createMatchFeedService({ database: source, clock: requestClock,
          competitionIds: [...competitionIds()] }).query(parameters, context);
        // Complete, fresh, same-snapshot groups follow the existing public detail projection. The
        // ordinary feed remains selected-price-only; neither provider calls nor rights overrides occur.
        const selectionPrices = await source.transaction((tx) => storedSlipPricePools(tx, feed.records),
          { isolationLevel: "RepeatableRead", maxWait: 5000, timeout: 30_000 });
        return { feed, selectionPrices };
      },
    }).query(criteria, locale);
  };
}

export const readPublicSlipBuild = createStoredSlipBuild({ database: getDatabase,
  competitionIds: () => getRuntimePolicy().choices.competitionIds ?? [], jointModel: boundJointSlipModel });
