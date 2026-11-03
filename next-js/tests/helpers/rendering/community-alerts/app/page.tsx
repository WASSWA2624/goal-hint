import { PublicShell } from "@/app/_components/public-shell";
import { SettingsEditor } from "@/components/admin/settings-editor";
import { AppBrandBar } from "@/components/navigation/app-brand-bar";
import { parseReportingDate } from "@/domain/calendar";
import { settingsPage } from "./fixture-state";

export const dynamic = "force-dynamic";
export default function Page() {
  return <PublicShell locale="en" today={parseReportingDate("2026-11-03")} current="best-slips" app>
    <AppBrandBar locale="en" />
    <p>Synthetic UI acceptance. No real accounts, payments or community destinations.</p>
    <SettingsEditor initial={settingsPage()} username="Synthetic reviewer" sessionAuthorized />
  </PublicShell>;
}
