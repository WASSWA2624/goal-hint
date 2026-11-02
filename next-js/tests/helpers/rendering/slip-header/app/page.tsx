import { criteria, syntheticBuild } from "./synthetic-slips";
import { HeaderPreview } from "./preview";

export default function Page() {
  const slip = syntheticBuild().data?.slips[0];
  const longSlip = syntheticBuild({ ...criteria, teamsMin: 1, teamsMax: 1, totalMin: 125, totalMax: 260 }, true).data?.slips[0];
  if (!slip || !longSlip) throw new Error("Slip-header checks need synthetic slips.");
  return <HeaderPreview slip={slip} longSlip={longSlip} />;
}
