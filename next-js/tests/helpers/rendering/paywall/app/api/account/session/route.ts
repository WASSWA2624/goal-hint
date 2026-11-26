import { requestAccess } from "../../../stored";
export async function GET(request: Request) {
  const access = await requestAccess(request);
  return Response.json({ phone: access.signedIn ? "+256712345678" : null, administrator: false,
    freeContentAccess: access.mode === "off" && access.tier === "full",
    subscription: access.signedIn ? { activeUntil: access.mode === "on" && access.tier === "full" ? new Date(Date.now() + 3_600_000).toISOString() : null,
      paymentPending: false, expired: access.tier === "free", canSubscribe: access.mode === "on" } : null },
    { headers: { "Cache-Control": "private, no-store" } });
}
