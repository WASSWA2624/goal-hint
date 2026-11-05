import { fixture, publicFixture } from "../../fixture";

export const dynamic = "force-dynamic";
export async function GET() {
  return fixture().unavailable ? Response.json({ error: "Synthetic outage" }, { status: 503, headers: { "Cache-Control": "no-store" } })
    : Response.json(publicFixture(), { headers: { "Cache-Control": "no-store" } });
}
