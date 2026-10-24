import { MatchDetailPage } from "@/app/_components/match-detail-page";
import { parseReportingDate } from "@/domain/calendar";
import { storedMatchDetailResponseSchema } from "@/domain/match-detail";
import { gateDetailResponse } from "@/domain/paywall";
import fixture from "../../../../fixture-match.json";

/** Captured synthetic unpublished match; no remote provider or private database is called. */
export default function MatchPreview() {
  const data = gateDetailResponse(storedMatchDetailResponseSchema.parse(fixture), { tier: "full", signedIn: true });
  return <MatchDetailPage result={{ data, error: null }} today={parseReportingDate("2026-10-09")} retryHref={data.route.path} showAccount />;
}
