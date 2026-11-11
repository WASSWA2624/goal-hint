import { CheckoutFlow } from "@/components/members/checkout-flow";
import { SubscribeLayout } from "@/components/members/subscribe-styles";
import { plans, settings, view } from "../../fixture";
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const parameters = await searchParams;
  const amount = (value: string | undefined, maximum: number, fallback: number) => value !== undefined && /^\d+$/u.test(value)
    ? Math.min(maximum, Number(value)) : fallback;
  const current = view(), scenario = parameters.scenario?.replace(/[^a-z0-9-]/giu, "").slice(0, 80);
  const initialView = { ...current,
    availableWalletUgx: amount(parameters.wallet, 2_000_000_000, current.availableWalletUgx),
    availableReferralDays: amount(parameters.earnedDays, 365, current.availableReferralDays),
    lastMethod: parameters.lastProvider === "mtn" || parameters.lastProvider === "airtel" ? parameters.lastProvider : current.lastMethod,
    ...(scenario ? { requests: [] } : {}) };
  const scenarioSettings = { ...settings,
    mtnEnabled: settings.mtnEnabled && parameters.disabledProvider !== "mtn" && parameters.disabledProvider !== "both",
    airtelEnabled: settings.airtelEnabled && parameters.disabledProvider !== "airtel" && parameters.disabledProvider !== "both" };
  const offers = parameters.packages === "empty" ? [] : parameters.packages === "long"
    ? plans.slice(0, 3).map(plan => ({ ...plan, name: "Full season international football access", priceUgx: 10000000 }))
    : parameters.packages === "standard" ? plans.slice(0, 3) : plans;
  return <main><h1>Goal Hint · payment acceptance</h1><p>Synthetic fixture. Never send money.</p><SubscribeLayout>
    <CheckoutFlow locale="en" settings={scenarioSettings} plans={offers} account={{ id: "11111111-1111-4111-8111-111111111111", phone: "256700000101",
      ...(scenario ? { draftScope: `checkout-preview-${scenario}` } : {}) }} initialView={initialView}
      topUp={parameters.add === "credit"} salesOpen={parameters.sales !== "paused"}
      noticeBeforeCheckout={<p data-checkout-notice>Existing trial notice outside Package and Pay.</p>} />
  </SubscribeLayout><details><summary>Sample screenshots for testing</summary>
    <p>Download an example, then choose it or copy and paste it into the screenshot box.</p>
    <ul>{[["valid-payment", "Clear MTN payment"], ["airtel-payment", "Clear Airtel payment"], ["wrong-recipient", "Airtel label with wrong receiving number"], ["another-payment", "Different payment (replacement)"], ["reported-payment", "Already-reported transaction"], ["not-payment", "Wrong image"]].map(([file, label]) => <li key={file}><a href={`/checkout-samples/${file}.png`} download>{label}</a></li>)}</ul>
  </details></main>;
}
