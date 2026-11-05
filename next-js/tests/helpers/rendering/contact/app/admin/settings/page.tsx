import { SettingsEditor } from "@/components/admin/settings-editor";
import { overview } from "../../fixture";

export const dynamic = "force-dynamic";
export default function Page() {
  return <main style={{ minHeight: "100dvh", display: "grid", gridTemplateRows: "minmax(0, 1fr)" }}>
    <SettingsEditor initial={overview()} username="synthetic-owner" sessionAuthorized />
  </main>;
}
