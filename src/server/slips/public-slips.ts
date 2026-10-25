import "server-only";

import type { Clock } from "../../domain/calendar.ts";
import { buildSlips, type SlipCriteria } from "../../domain/slip-builder.ts";
import { getRuntimePolicy } from "../config/runtime-policy.ts";
import { getDatabase, type DatabaseRuntime } from "../database/client.ts";
import { createMatchFeedService } from "../matches/feed-service.ts";
import { createMysqlPublicSearchLimiter } from "../matches/search-limit.ts";
import { storedSlipPricePools } from "./price-read.ts";
import { createSlipBuildService } from "./slip-service.ts";

/** Server page reads use the same public stored projection and competition scope as the match feed.
 * Caches are omitted for this multi-page decision so every page uses its one pinned request clock.
 * Database initialization stays lazy while the public odds feature is disabled. */
export function createStoredSlipBuild({ database, competitionIds, consume }: Readonly<{
  database: () => DatabaseRuntime; competitionIds: () => readonly number[]; consume?: () => Promise<void>;
}>) {
  return function readStoredSlipBuild(criteria: SlipCriteria, clock?: Clock, locale = "en", build: typeof buildSlips = buildSlips) {
    return createSlipBuildService({ ...(clock ? { clock } : {}), build,
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
  competitionIds: () => getRuntimePolicy().choices.competitionIds ?? [] });
