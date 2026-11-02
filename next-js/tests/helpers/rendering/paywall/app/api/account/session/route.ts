import { requestAccess } from "../../../stored";
export async function GET(request: Request) {
  const access = await requestAccess(request);
  return Response.json({ phone: access.signedIn ? "+256712345678" : null, administrator: false,
    subscription: access.signedIn ? { activeUntil: access.tier === "full" ? new Date(Date.now() + 3_600_000).toISOString() : null,
      paymentPending: false, expired: access.tier === "free", canSubscribe: true } : null },
    { headers: { "Cache-Control": "private, no-store" } });
}
