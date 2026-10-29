import { bannerScenario, bannerSession } from "../../../fixture";

/** Only scripted identities are returned; no application account store is imported. */
export async function GET(request: Request) {
  const referer = request.headers.get("referer");
  const parameters = referer ? new URL(referer).searchParams : new URL(request.url).searchParams;
  const cookie = request.headers.get("cookie")?.match(/(?:^|;\s*)subscription-banner-fixture=([^;]+)/u)?.[1];
  const scenario = bannerScenario(cookie ?? parameters.get("state"));
  const delay = Math.max(0, Math.min(3_000, Number(parameters.get("delay")) || 0));
  if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
  if (scenario === "failure") return Response.json({ message: "Synthetic temporary outage" }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  return Response.json(bannerSession(scenario), { headers: { "Cache-Control": "private, no-store" } });
}
