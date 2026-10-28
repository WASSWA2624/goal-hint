import { autoControl, type AutoMode, type AutoPhase } from "../../../auto-state";

const phases: readonly AutoPhase[] = ["scheduled", "live", "halftime", "finished"];
const modes: readonly AutoMode[] = ["ok", "unavailable", "forbidden"];

/** Test-only source controls; no production route imports this file. */
export function GET() {
  return Response.json(autoControl(), { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  let body: { phase?: AutoPhase; mode?: AutoMode; delayMs?: number; reset?: boolean };
  try { body = await request.json(); } catch { return Response.json({ error: "invalid-request" }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body)
    || body.phase !== undefined && !phases.includes(body.phase) || body.mode !== undefined && !modes.includes(body.mode)
    || body.delayMs !== undefined && (!Number.isInteger(body.delayMs) || body.delayMs < 0 || body.delayMs > 2000)) {
    return Response.json({ error: "invalid-request" }, { status: 400 });
  }
  const current = autoControl();
  if (body.reset) Object.assign(current, { phase: "scheduled", mode: "ok", delayMs: 0, requests: 0, reads: 0, inFlight: 0, maxInFlight: 0, batches: [] });
  if (body.phase !== undefined) current.phase = body.phase;
  if (body.mode !== undefined) current.mode = body.mode;
  if (body.delayMs !== undefined) current.delayMs = body.delayMs;
  return Response.json(current, { headers: { "cache-control": "no-store" } });
}
