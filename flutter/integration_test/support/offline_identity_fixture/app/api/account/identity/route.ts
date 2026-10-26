import { json, readCookie } from "@/server/http/private-http";
import { sessions, identities } from "../../../offline-identity";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const member = await sessions.verify(readCookie(request, "goal-hint-member"));
  const identity = member?.phone === identities.A.phone ? "A" : member ? "B" : null;
  return json({ identity, httpOnlyCookiePresent: readCookie(request, "goal-hint-member") !== undefined });
}
