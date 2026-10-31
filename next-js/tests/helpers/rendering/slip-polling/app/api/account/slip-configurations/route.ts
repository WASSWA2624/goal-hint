export function GET() { return Response.json({ configurations: [] }, { headers: { "Cache-Control": "no-store" } }); }
