export function GET() {
  return Response.json({ phone: "256700000001", administrator: false, subscription: null }, { headers: { "Cache-Control": "no-store" } });
}
