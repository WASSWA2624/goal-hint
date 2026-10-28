import { cookies } from "next/headers";

/** Synthetic acceptance identities only; no application account store is imported. */
export async function GET() {
  const state = (await cookies()).get("header-fixture-state")?.value ?? "guest";
  return Response.json({ phone: state === "member" ? "256700000000" : null, administrator: state === "admin", subscription: null },
    { headers: { "Cache-Control": "no-store" } });
}
