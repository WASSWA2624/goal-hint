import { fixtureTokens } from "../../../fixture-identity";

/** Issue an expired server record's synthetic cookie, not a valid session. */
export async function POST() {
  return Response.json({ synthetic: true }, { headers: {
    "Cache-Control": "no-store",
    "Set-Cookie": `goal-hint-member=${fixtureTokens.expired}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400`,
  } });
}
