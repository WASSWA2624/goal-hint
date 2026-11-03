import { publicCommunityLinks } from "../../../domain/community.ts";
import { getAnalyticsServices } from "../../../server/analytics/analytics-http.ts";
import { settingsServiceFor } from "../../../server/members/settings.ts";

/** Public destinations only. No account, subscription or referral side effects. */
export async function GET() {
  try {
    const { database } = await getAnalyticsServices();
    const state = database ? await settingsServiceFor(database).current() : null;
    return Response.json({ links: publicCommunityLinks(state?.settings?.communityLinks) }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ links: [] }, { headers: { "Cache-Control": "no-store" } }); }
}
