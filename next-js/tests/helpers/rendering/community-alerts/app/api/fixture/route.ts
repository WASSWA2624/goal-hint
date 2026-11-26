import { defaultSubscriptionSettings } from "@/domain/subscription-settings";
import { communityScenarios, fixture, setCommunityScenario, type CommunityScenario } from "../../fixture-state";
export function POST(request: Request) {
  const query = new URL(request.url).searchParams;
  const scenario = query.get("scenario") ?? (query.has("configured") ? query.get("configured") === "0" ? "unconfigured" : "configured" : null);
  if (scenario && !communityScenarios.includes(scenario as CommunityScenario)) {
    return Response.json({ error: "Unknown community scenario." }, { status: 400 });
  }
  if (query.get("reset") === "1") fixture.settings = { ...defaultSubscriptionSettings };
  if (query.has("role")) fixture.role = query.get("role")!;
  if (scenario) setCommunityScenario(scenario as CommunityScenario);
  if (query.get("resetInvitations") === "1") fixture.invitationAccounts.clear();
  if (query.has("invitationTime")) fixture.invitationTime = Number(query.get("invitationTime"));
  const account = query.get("invitationAccount");
  return Response.json({ role: fixture.role, settings: fixture.settings }, {
    headers: account && /^[a-z0-9-]+$/u.test(account)
      ? { "Set-Cookie": `fixture-community-account=${account}; HttpOnly; SameSite=Lax; Path=/` } : {},
  });
}
