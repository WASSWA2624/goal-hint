"use client";

import { useState } from "react";

export default function FaultFixture() {
  const [failed, setFailed] = useState(false);
  if (failed) throw new Error("Synthetic render failure");
  return <main><button type="button" onClick={() => setFailed(true)}>Trigger render failure</button></main>;
}
