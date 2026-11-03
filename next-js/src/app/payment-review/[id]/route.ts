import { reviewHref, reviewIdSchema } from "../../../domain/payment-alerts.ts";
import { memberLoginPath } from "../../../domain/member-navigation.ts";
import { getAnalyticsServices, requireAdmin } from "../../../server/analytics/analytics-http.ts";
import { privateHeaders } from "../../../server/http/private-http.ts";

/** Notification entry survives expired authentication without weakening the private review guard. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!reviewIdSchema.safeParse(id).success) return new Response("Payment unavailable.", { status: 404, headers: privateHeaders });
  const href = reviewHref(id), services = await getAnalyticsServices();
  const target = await requireAdmin(services, request) ? href : `${memberLoginPath}&${new URLSearchParams({ return: href })}`;
  return new Response(null, { status: 303, headers: { ...privateHeaders, Location: target } });
}
