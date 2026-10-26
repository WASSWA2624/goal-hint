import "server-only";

import { cache } from "react";
import { cheapestActivePlan, type SubscriptionOffer } from "../../domain/subscription-offer.ts";
import { createPlansService } from "./plans.ts";
import { getAnalyticsServices } from "../analytics/analytics-http.ts";

/** Request-local public price. No settings or plan is seeded, including during an outage. */
export const readSubscriptionOffer = cache(async (): Promise<SubscriptionOffer | null> => {
  try {
    const { database } = await getAnalyticsServices();
    return database ? cheapestActivePlan(await createPlansService(database).list()) : null;
  } catch { return null; }
});
