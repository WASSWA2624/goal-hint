"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function FixtureControls() {
  const router = useRouter(), [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function reset() {
    setBusy(true);setError("");
    try {
      const response = await fetch("/api/fixture/subscribers", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", cache: "no-store" });
      if (!response.ok) throw new Error("Unable to reset the synthetic fixture.");
      router.replace("/admin/subscribers?accountId=00000000-0000-4000-8000-000000000100");router.refresh();setBusy(false);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Fixture reset failed.");setBusy(false); }
  }
  return <details data-fixture-controls style={{ margin: "24px", padding: "12px" }}><summary>Synthetic acceptance controls</summary>
    <p>All subscriber actions change this fixture process only. No database or messages are used.</p>
    <button type="button" disabled={busy} onClick={() => void reset()}>Reset synthetic subscriber data</button>
    {error && <p role="alert">{error}</p>}
  </details>;
}
