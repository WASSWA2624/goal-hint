import { getAnalyticsServices } from "../../../server/analytics/analytics-http.ts";
import { createContactHandler } from "../../../server/members/contact-http.ts";
import { settingsServiceFor } from "../../../server/members/settings.ts";

export const dynamic = "force-dynamic";
export const GET = createContactHandler(async () => {
  const { database } = await getAnalyticsServices();
  return database ? settingsServiceFor(database).currentFresh() : null;
});
