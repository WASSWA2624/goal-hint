import { json, readCookie } from "@/server/http/private-http";
import { sessions, identities } from "../../../offline-identity";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const member = await sessions.verify(readCookie(request, "goal-hint-member"));
  if (!member) return json({ error: "signed-out" }, 401);
  const identity = member.phone === identities.A.phone ? "A" : "B";
  return json({ phone: member.phone, prediction: `synthetic-protected-prediction-${identity}` });
}
