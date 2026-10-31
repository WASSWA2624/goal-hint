import { sharedSlipUrl } from "@/domain/shared-slips";
import { fixtureSlip, viewer } from "../../../data";
export async function POST(request: Request) {
  if (viewer(request.headers.get("cookie")).tier !== "full") return Response.json({ error: "subscription-required" }, { status: 403 });
  const input = await request.json(), index = Number(String(input.slipId).split("-").at(-1));
  const id = String(index + 1).padStart(32, "0");
  return Response.json({ id, url: sharedSlipUrl(id), createdAt: new Date().toISOString(), slip: fixtureSlip(index) });
}
