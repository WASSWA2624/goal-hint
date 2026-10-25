import RealPage from "@/app/(owner)/admin/settings/page";
import { seedSettings, settingsScenario } from "../../../fixture-settings";
import { SettingsFixtureControls } from "../../../settings-fixture-controls";

export const dynamic = "force-dynamic";
export { metadata } from "@/app/(owner)/admin/settings/page";
export default async function Page(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const parameters = await props.searchParams, scenario = settingsScenario(parameters.fixture);
  seedSettings(scenario);
  return <><RealPage key={`${scenario}:${parameters.revision ?? "initial"}`} {...props} /><SettingsFixtureControls scenario={scenario} /></>;
}
