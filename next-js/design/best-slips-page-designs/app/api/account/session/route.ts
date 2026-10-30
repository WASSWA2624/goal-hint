import { requestViewer } from "../../../viewer-modes";

/** Local personas only; account storage is never contacted by this review. */
export function GET(request: Request) {
  const viewer = requestViewer(request);
  return Response.json({ phone: viewer === "guest" ? null : "+256700000000", administrator: false,
    subscription: { activeUntil: viewer === "subscriber" ? "2099-12-31T21:00:00Z" : null,
      paymentPending: false, canSubscribe: true } }, { headers: { "Cache-Control": "no-store" } });
}
