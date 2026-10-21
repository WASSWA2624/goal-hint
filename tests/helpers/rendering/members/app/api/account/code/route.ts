/** Retired activation-code transport; only admin-approved payments grant access. */
export function POST() {
  return Response.json({ error: "removed" }, { status: 410, headers: { "Cache-Control": "private, no-store" } });
}
