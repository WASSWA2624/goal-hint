import { memberCookieName } from "@/server/members/member-sessions";

/** This fake resolver cookie is confined to the isolated fixture application. */
export async function POST(request: Request) {
  const viewer = await request.text();
  if (!["anonymous", "entitled", "expired", "revoked", "test", "off"].includes(viewer)) return new Response(null, { status: 400 });
  return Response.json({ viewer }, { headers: { "Set-Cookie": `${memberCookieName(false)}=${viewer === "entitled" ? "f".repeat(43) : viewer}; Path=/; SameSite=Lax` } });
}
