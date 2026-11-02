/** Synthetic account projection; this fixture never reads a member store. */
export function GET() {
  return Response.json({ phone: "256700000000", administrator: false,
    subscription: { activeUntil: new Date(Date.now() + 86_400_000).toISOString(), paymentPending: false, canSubscribe: false } },
  { headers: { "Cache-Control": "no-store" } });
}
