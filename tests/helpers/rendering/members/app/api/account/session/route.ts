import { fixtureTokens } from "../../../fixture-auth";
export function GET(request: Request) {
  const authenticated = request.headers.get("cookie")?.includes(`goal-hint-member=${fixtureTokens.authenticated}`);
  return Response.json({ phone: authenticated ? "256700000101" : null, administrator: false }, { headers: { "Cache-Control": "no-store" } });
}
