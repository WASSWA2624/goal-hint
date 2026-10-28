import { cookies } from "next/headers";

/** Count is controlled by this isolated fixture, never by a payment provider. */
export async function GET() {
  const count = (await cookies()).get("header-fixture-pending")?.value === "103" ? 103 : 3;
  return Response.json({ pendingCount: count }, { headers: { "Cache-Control": "no-store" } });
}
