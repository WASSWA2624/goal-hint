import { Button } from "@/components/ui/controls";
import { paymentScenarios } from "../fixture";

export const dynamic = "force-dynamic";
export const metadata = { title: "Synthetic payment tests", robots: { index: false, follow: false } };

/** Local acceptance controls only; this page is not part of the production app. */
export default function FixturePage() {
  return <main style={{ maxWidth: "40rem", margin: "32px auto", padding: "24px" }}>
    <h1>Synthetic payment tests</h1>
    <p>Test data only. Never send money to these numbers.</p>
    <form action="/api/fixture/session" method="post" style={{ display: "grid", gap: "16px" }}>
      <label htmlFor="fixture-scenario">Scenario</label>
      <select id="fixture-scenario" name="scenario" defaultValue="signed-in" style={{ minHeight: "44px", font: "inherit", padding: "8px" }}>
        {paymentScenarios.map(scenario => <option key={scenario} value={scenario}>{scenario}</option>)}
      </select>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
        <Button type="submit" name="action" value="start">Start scenario</Button>
        <Button type="submit" name="action" value="reset" variant="secondary">Reset scenario</Button>
        <Button type="submit" name="action" value="approve" variant="secondary">Approve payment</Button>
      </div>
    </form>
  </main>;
}
