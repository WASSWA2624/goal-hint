"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
const scenarios = ["success", "send-failed", "rate-limited", "invalid-code", "unavailable"];
export function RefreshProbe({ initialScenario = "success" }: { initialScenario?: string }) {
  const router = useRouter();
  const [probe, setProbe] = useState("");
  const [scenario, setScenario] = useState(scenarios.includes(initialScenario) ? initialScenario : "success");
  useEffect(() => { document.cookie = `member-fixture-scenario=${scenario}; Path=/; SameSite=Lax`; }, [scenario]);
  return <div data-fixture-controls style={{ padding: "16px", paddingBottom: "160px", display: "grid", gap: "12px" }}>
    <label>Fixture API outcome <select value={scenario} onChange={event => setScenario(event.currentTarget.value)}>
      {scenarios.map(value => <option key={value} value={value}>{value}</option>)}
    </select></label>
    <p>Synthetic verification code: 123456. Other codes fail. This fixture sends no messages and uses no database.</p>
    <button type="button" onClick={() => router.refresh()}>Refresh acceptance fixture</button>
    <button type="button" onClick={() => setProbe(JSON.stringify({ hash: location.hash,
      nextTree: !!history.state?.__PRIVATE_NEXTJS_INTERNALS_TREE }))}>Inspect browser history</button>
    <output>{probe}</output>
  </div>;
}
