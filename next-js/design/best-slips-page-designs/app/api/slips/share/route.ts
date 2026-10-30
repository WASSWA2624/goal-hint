import { shareSlipSourceSchema, sharedSlipUrl } from "@/domain/shared-slips";
import { samples } from "../../../review-data";
import { requestViewer } from "../../../viewer-modes";

/** Exercise the unchanged drawer without creating a public link or storing a share. */
export async function POST(request: Request) {
  const parsed = shareSlipSourceSchema.safeParse(await request.json());
  const view = parsed.success ? samples.find((sample) => sample.slip?.id === parsed.data.slipId) : null;
  if (!view?.slip) return Response.json({ error: "Unknown sample slip." }, { status: 400 });
  if (requestViewer(request) !== "subscriber" && !view.completed) return Response.json({ error: "Subscription required." }, { status: 403 });
  const id = "0".repeat(32);
  const { id: slipId, selections, totalOdds, averageProbability, oddsBasis } = view.slip;
  return Response.json({ id, url: sharedSlipUrl(id), createdAt: "2026-10-30T09:00:00Z",
    slip: { id: slipId, selections, totalOdds, averageProbability, oddsBasis } });
}
