import { viewer } from "../../../data";
export function GET(request: Request) {
  const eligible = viewer(request.headers.get("cookie")).tier === "full";
  return Response.json({ phone: eligible ? "+256700000001" : null, administrator: false,
    subscription: { activeUntil: eligible ? new Date(Date.now() + 3_600_000).toISOString() : null,
      paymentPending: false, canSubscribe: true, creditUgx: 0, autoRenew: false, renewsFromCredit: false } }, { headers: { "Cache-Control": "no-store" } });
}
