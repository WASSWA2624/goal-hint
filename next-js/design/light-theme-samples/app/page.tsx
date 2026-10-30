import { MatchFeedPage } from "@/app/_components/match-feed-page";
import { PerformanceSummary } from "@/components/performance/performance-summary";
import { SlipCard } from "@/components/slips/slip-card";
import { BodyText, SectionHeading, Stack } from "@/components/ui/layout";
import { syntheticBuild } from "../../../tests/helpers/rendering/slips/app/stored";
import { previewFeed } from "./fixture-data";
import { PreviewTheme } from "./preview-theme";

export const dynamic = "force-dynamic";

/** Isolated design review: the production application never imports this page. */
export default async function Page({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const input = await searchParams;
  const themeId = typeof input.theme === "string" ? input.theme : undefined;
  const feedParameters = { ...input };
  delete feedParameters.theme;
  const feed = previewFeed(feedParameters);
  const slip = syntheticBuild().data?.slips[0];
  const samples = <Stack $gap="md" data-review-additional-samples>
    <SectionHeading>Performance and slips</SectionHeading>
    <BodyText>Sample records for comparing light themes. No live forecasts or account data.</BodyText>
    <PerformanceSummary locale="en" kind="matches" title="Overall performance" period="Sample period"
      counts={{ total: 120, won: 82, lost: 23, pending: 15, void: 0, unavailable: 0 }} />
    {slip && <SlipCard slip={slip} index={0} locale="en" />}
  </Stack>;
  return <PreviewTheme themeId={themeId}>
    <MatchFeedPage {...feed} showAccount={false} subscriberOnly={false} pagination={samples} />
  </PreviewTheme>;
}
