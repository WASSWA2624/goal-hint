import { createMemberAuthHandler } from "@/server/members/member-auth-http";
import { journeyServices } from "../../../journey";
export async function POST(request: Request) {
  const response = await createMemberAuthHandler("login", async () => journeyServices())(request);
  if (response.ok) response.headers.append("Set-Cookie", "fixture-sharing-viewer=member; Path=/; HttpOnly; SameSite=Lax");
  return response;
}
