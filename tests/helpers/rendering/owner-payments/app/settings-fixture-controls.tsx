"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { SettingsScenario } from "./fixture-settings";

const scenarios = ["writable", "managed", "missing", "requirements-race", "save-failed", "saved-without-requirements"];
export function SettingsFixtureControls({ scenario }: { scenario: SettingsScenario }) {
  const router = useRouter(), [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => { document.cookie = `owner-settings-scenario=${scenario}; Path=/; SameSite=Lax`; }, [scenario]);
  return <details data-fixture-controls style={{ margin: "24px", padding: "12px", paddingBottom: "90px" }}><summary>Synthetic settings controls</summary>
    <p>All changes stay in this fixture process. No business database or external service is used.</p>
    <label>Settings scenario <select value={scenario} disabled={busy} onChange={event => router.push(`/admin/settings?fixture=${event.target.value}`)}>
      {scenarios.map(value => <option key={value} value={value}>{value}</option>)}
    </select></label>{" "}
    <button type="button" disabled={busy} onClick={async () => {
      setBusy(true); setError("");
      try {
        const response = await fetch("/api/fixture/settings", { method: "POST", headers: { "Content-Type": "application/json", "X-Settings-Fixture-Scenario": scenario }, body: "{}" });
        if (!response.ok) throw new Error("Unable to reset the synthetic settings.");
        router.replace(`/admin/settings?fixture=${scenario}&revision=${Date.now()}`);
      } catch (failure) { setError(failure instanceof Error ? failure.message : "Fixture reset failed."); }
      finally { setBusy(false); }
    }}>Reset synthetic settings</button>
    {error && <p role="alert">{error}</p>}
  </details>;
}
