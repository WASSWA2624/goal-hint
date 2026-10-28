/** Anonymous fixture session; never reads a member or administrator store. */
export function GET() {
  return Response.json({ phone: null, administrator: false, subscription: null }, { headers: { "Cache-Control": "no-store" } });
}
