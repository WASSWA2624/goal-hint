import { PublicShell } from "@/app/_components/public-shell";
import { parseFixtureSnapshot } from "@/domain/fixture-snapshot";
import { records, syntheticBuild, today } from "./synthetic-slips";
import { ThemePreview } from "./theme-preview";

export default function Page() {
  const snapshots = records.slice(0, 3).map((record) => {
    const snapshot = { ...record };
    delete snapshot.selectionPrices;
    return parseFixtureSnapshot(snapshot);
  });
  const slips = syntheticBuild().data?.slips;
  if (!slips?.length) throw new Error("Synthetic theme fixture needs a generated slip.");
  return <PublicShell locale="en" today={today} current="today" app compact>
    <ThemePreview fixtures={snapshots} slip={slips[0]!} />
  </PublicShell>;
}
