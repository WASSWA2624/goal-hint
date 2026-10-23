export function POST() {
  return new Response(null, { status: 303, headers: { Location: "/en/account?status=signed-out", "Cache-Control": "no-store",
    "Set-Cookie": "goal-hint-member=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax" } });
}
