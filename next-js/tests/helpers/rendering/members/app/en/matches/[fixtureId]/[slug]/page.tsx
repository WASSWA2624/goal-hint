import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { MatchDetailPage } from "@/app/_components/match-detail-page";
import { parseReportingDate } from "@/domain/calendar";
import { storedMatchDetailResponseSchema } from "@/domain/match-detail";
import { gateDetailResponse } from "@/domain/paywall";
import fixture from "../../../../fixture-match.json";
import { fixtureTokens } from "../../../../fixture-identity";
import { fixtureSubscriptionStatus, subscriptionScenario } from "../../../../fixture-subscription";

/** Use the app's match detail and unlock link with synthetic, unpaid member access. */
export default async function Match({ params }: { params: Promise<{ fixtureId: string; slug: string }> }) {
  const { fixtureId, slug } = await params;
  if (fixtureId !== fixture.route.fixtureId || slug !== fixture.route.slug) notFound();
  const path = `/en/matches/${fixtureId}/${slug}`, jar = await cookies(), token = jar.get("goal-hint-member")?.value;
  const signedIn = token === fixtureTokens.authenticated || token === fixtureTokens.registered;
  const scenario = subscriptionScenario(jar.get("member-fixture-subscription")?.value);
  const tier = signedIn && fixtureSubscriptionStatus(scenario).activeUntil ? "full" : "free";
  const data = gateDetailResponse(storedMatchDetailResponseSchema.parse({ ...fixture, route: { fixtureId, slug, path } }), { tier, signedIn });
  return <MatchDetailPage result={{ data, error: null }} today={parseReportingDate("2026-10-09")} retryHref={path} showAccount />;
}
