import { cookies } from "next/headers";

/** Local acceptance control: only exists in the ignored isolated fixture build. */
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const state = query.get("state") ?? "guest";
  if (!["guest", "member", "admin"].includes(state)) return Response.json({ error: "Unknown synthetic state" }, { status: 400 });
  const jar = await cookies();
  jar.set("header-fixture-state", state, { path: "/", httpOnly: true, sameSite: "lax" });
  jar.set("header-fixture-pending", query.get("pending") === "103" ? "103" : "3", { path: "/", httpOnly: true, sameSite: "lax" });
  return Response.json({ state }, { headers: { "Cache-Control": "no-store" } });
}
