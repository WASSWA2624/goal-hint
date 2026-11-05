import { PublicShell } from "@/app/_components/public-shell";
import { SettingsEditor } from "@/components/admin/settings-editor";
import { parseReportingDate } from "@/domain/calendar";
import { fixture, settingsPage } from "../../fixture-state";

export const dynamic = "force-dynamic";
export default function Page() {
  return <PublicShell locale="en" today={parseReportingDate("2026-11-05")} current="dashboard" app>
    {fixture.role === "admin"
      ? <SettingsEditor initial={settingsPage()} username="Synthetic reviewer" sessionAuthorized />
      : <p data-fixture-denied>Sign in as a fixture administrator to edit settings.</p>}
  </PublicShell>;
}
