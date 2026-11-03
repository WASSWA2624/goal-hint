import scenarios from "../../../scenarios.json";
export function GET() { return Response.json({ ...scenarios.summary, asOf: Date.now() }, { headers: { "Cache-Control": "no-store" } }); }
