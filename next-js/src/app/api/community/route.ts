import { getAnalyticsServices } from "../../../server/analytics/analytics-http.ts";
import { createCommunityHandler } from "../../../server/members/community-http.ts";
import { settingsServiceFor } from "../../../server/members/settings.ts";

/** Public destinations only. No account, subscription or referral side effects. */
export const GET = createCommunityHandler(async () => {
  const { database } = await getAnalyticsServices();
  return database ? settingsServiceFor(database).current() : null;
});
