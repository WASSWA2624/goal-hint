import { Container, BodyText, PageHeading, PageMain, Stack } from "@/components/ui/layout";
import { parseFixtureSnapshot } from "@/domain/fixture-snapshot";
import { isMarketFamily, marketRules, validateMarketGroup } from "@/domain/markets";
import { CardPreview } from "./preview";
import examples from "./examples.json";
export default function Page() {
  const checked = examples.map((entry) => ({ ...entry, fixture: parseFixtureSnapshot(entry.fixture),
    selectedFamily: isMarketFamily(entry.selectedFamily) ? entry.selectedFamily : "match-result" as const }));
  const equal = validateMarketGroup("match-result", { source: "ai", period: marketRules.period,
    probabilities: { "home-win": 1 / 3, draw: 1 / 3, "away-win": 1 / 3 } });
  const boundary = validateMarketGroup("total-goals", { source: "api-football", period: marketRules.period, line: 2.5,
    probabilities: { "over-2.5": 0.001, "under-2.5": 0.999 } });
  if (!equal.valid || !boundary.valid) throw new Error("Invalid synthetic probabilities");
  return <PageMain><Container><Stack $gap="lg">
    <PageHeading>Match card acceptance examples</PageHeading>
    <BodyText>All teams, predictions, scores, outcomes and logo URLs below are synthetic component examples.</BodyText>
    <CardPreview examples={checked} equal={equal.markets[0]!} boundary={boundary.markets[0]!} />
  </Stack></Container></PageMain>;
}
