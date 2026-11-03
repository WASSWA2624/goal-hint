import { fixture } from "../../fixture-state";
export function POST(request: Request) {
  const query = new URL(request.url).searchParams;
  fixture.role = query.get("role") ?? "visitor"; fixture.configured = query.get("configured") !== "0";
  return Response.json({ role: fixture.role, configured: fixture.configured });
}
