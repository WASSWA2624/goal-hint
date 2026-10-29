import { shareSlipSourceSchema } from "@/domain/shared-slips";
import { fixtureShared, fixtureSlip, fixtureSource, scenarios } from "../../../data";

export async function POST(request: Request) {
  let source;
  try { source = shareSlipSourceSchema.parse(await request.json()); }
  catch { return Response.json({ error: "invalid-request" }, { status: 400 }); }
  const scenario = scenarios.find(value => fixtureSlip(value).id === source.slipId);
  if (!scenario || scenario === "best" && source.source !== "best" || scenario !== "best" && source.source !== "builder")
    return Response.json({ error: "changed" }, { status: 409 });
  if (JSON.stringify(source) !== JSON.stringify(fixtureSource(scenario))) return Response.json({ error: "changed" }, { status: 409 });
  const error = { unauthorized: [403, "subscription-required"], changed: [409, "changed"], failure: [503, "unavailable"] } as const;
  if (scenario in error) {
    const [status, code] = error[scenario as keyof typeof error];
    return Response.json({ error: code }, { status });
  }
  return Response.json(fixtureShared(scenario), { headers: { "Cache-Control": "no-store" } });
}
