"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
export function RefreshProbe() {
  const router = useRouter();
  const [probe, setProbe] = useState("");
  return <div style={{ padding: "16px", paddingBottom: "160px" }}>
    <button type="button" onClick={() => router.refresh()}>Refresh acceptance fixture</button>
    <button type="button" onClick={() => setProbe(JSON.stringify({ hash: location.hash,
      nextTree: !!history.state?.__PRIVATE_NEXTJS_INTERNALS_TREE }))}>Inspect browser history</button>
    <output>{probe}</output>
  </div>;
}
