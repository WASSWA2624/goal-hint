"use client";

import { useState } from "react";
import { refreshMemberSession } from "@/components/members/member-session";
import { bannerScenarios, type BannerScenario } from "./fixture";

/** Change only the isolated fixture cookie, then exercise the production external-store refresh. */
export function BannerProbe({ initial }: { initial: BannerScenario }) {
  const [state, setState] = useState(initial);
  const [confirmed, setConfirmed] = useState("");
  const apply = async (next: BannerScenario) => {
    setState(next);
    document.cookie = `subscription-banner-fixture=${next}; Path=/; SameSite=Lax`;
    await refreshMemberSession();
    setConfirmed(next);
  };
  return <section data-banner-fixture data-banner-fixture-confirmed={confirmed}>
    <h1>Subscription banner acceptance</h1>
    <label>Session scenario <select value={state} onChange={(event) => { void apply(event.target.value as BannerScenario); }}>
      {bannerScenarios.map((scenario) => <option key={scenario} value={scenario}>{scenario}</option>)}
    </select></label>
    <button type="button" onClick={() => { void apply(state); }}>Refresh session</button>
    <output>{confirmed ? `Confirmed ${confirmed}` : "Waiting for browser acceptance"}</output>
  </section>;
}
