"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
const scenarios = ["success", "send-failed", "rate-limited", "invalid-code", "unavailable", "denied", "missing", "blocked", "pending-verification", "password-reset"];
export function RefreshProbe({ initialScenario = "success" }: { initialScenario?: string }) {
  const router = useRouter();
  const [probe, setProbe] = useState("");
  const [scenario, setScenario] = useState(scenarios.includes(initialScenario) ? initialScenario : "success");
  useEffect(() => { document.cookie = `member-fixture-scenario=${scenario}; Path=/; SameSite=Lax`; }, [scenario]);
  function pasteCode(value: string) {
    const input = document.querySelector<HTMLInputElement>('input[name="code"][autocomplete="one-time-code"]');
    if (!input) { setProbe("Open the code-entry step first."); return; }
    const clipboard = new DataTransfer();clipboard.setData("text/plain", value);
    input.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: clipboard }));
    setProbe("Dispatched a synthetic paste event. The system clipboard was not accessed.");
  }
  return <div data-fixture-controls style={{ padding: "16px", paddingBottom: "160px", display: "grid", gap: "12px" }}>
    <label>Fixture API outcome <select value={scenario} onChange={event => setScenario(event.currentTarget.value)}>
      {scenarios.map(value => <option key={value} value={value}>{value}</option>)}
    </select></label>
    <p>Synthetic verification code: 123456. Other codes fail. This fixture sends no messages and uses no database.</p>
    <button type="button" onClick={() => pasteCode(" 123456 ")}>Paste valid synthetic OTP</button>
    <button type="button" onClick={() => pasteCode("Your code is 123456.")}>Paste invalid synthetic OTP</button>
    <button type="button" onClick={() => router.refresh()}>Refresh acceptance fixture</button>
    <button type="button" onClick={() => setProbe(JSON.stringify({ hash: location.hash,
      nextTree: !!history.state?.__PRIVATE_NEXTJS_INTERNALS_TREE }))}>Inspect browser history</button>
    <output>{probe}</output>
  </div>;
}
