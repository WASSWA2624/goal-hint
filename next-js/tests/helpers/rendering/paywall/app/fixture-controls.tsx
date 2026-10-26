"use client";

import { useState } from "react";

/** Isolated browser acceptance only: switch the fake resolver without refreshing the current page. */
export function FixtureControls() {
  const [message, setMessage] = useState("");
  return <aside data-analytics-ignore style={{ padding: 8 }}>
    <label>Acceptance viewer <select defaultValue="anonymous" onChange={async (event) => {
      const viewer = event.target.value;
      await fetch("/api/test/viewer", { method: "POST", body: viewer, credentials: "same-origin" });
      setMessage(`${viewer}: cookie changed; the next poll rechecks access.`);
    }}>{["anonymous", "entitled", "expired", "revoked", "test", "off"].map((viewer) => <option key={viewer}>{viewer}</option>)}</select></label>
    <button type="button" onClick={() => location.reload()}>Reload viewer</button>
    <output>{message}</output>
  </aside>;
}
