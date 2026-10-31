export function GET(request: Request) {
  // Ordinary fixture scenarios model a subscriber; recipient cookies exercise restricted states.
  const viewer = /(?:^|;\s*)fixture-sharing-viewer=([^;]+)/u.exec(request.headers.get("cookie") ?? "")?.[1] ?? "eligible";
  return Response.json({ phone: viewer === "guest" ? null : "+256700000001", administrator: false,
    subscription: { activeUntil: viewer === "eligible" ? new Date(Date.now() + 3_600_000).toISOString() : null,
      paymentPending: false, canSubscribe: true, creditUgx: 0, autoRenew: false, renewsFromCredit: false } },
  { headers: { "Cache-Control": "no-store" } });
}
