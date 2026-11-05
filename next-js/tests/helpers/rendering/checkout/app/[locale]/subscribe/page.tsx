import { CheckoutFlow } from "@/components/members/checkout-flow";
import { SubscribeLayout } from "@/components/members/subscribe-styles";
import { plans, settings, view } from "../../fixture";
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const parameters = await searchParams;
  const offers = parameters.packages === "empty" ? [] : parameters.packages === "long"
    ? plans.slice(0, 3).map(plan => ({ ...plan, name: "Full season international football access", priceUgx: 10000000 }))
    : parameters.packages === "standard" ? plans.slice(0, 3) : plans;
  return <main><h1>Goal Hint · payment acceptance</h1><p>Synthetic fixture. Never send money.</p><SubscribeLayout>
    <CheckoutFlow locale="en" settings={settings} plans={offers} account={{ id: "11111111-1111-4111-8111-111111111111", phone: "256700000101" }} initialView={view()}
      topUp={parameters.add === "credit"} noticeBeforeCheckout={<p data-checkout-notice>Existing trial notice outside Package.</p>} />
  </SubscribeLayout><details><summary>Sample screenshots for testing</summary>
    <p>Download an example, then choose it or copy and paste it into the screenshot box.</p>
    <ul>{[["valid-payment", "Clear MTN payment"], ["airtel-payment", "Clear Airtel payment"], ["wrong-recipient", "Airtel label with wrong receiving number"], ["another-payment", "Different payment (replacement)"], ["reported-payment", "Already-reported transaction"], ["not-payment", "Wrong image"]].map(([file, label]) => <li key={file}><a href={`/checkout-samples/${file}.png`} download>{label}</a></li>)}</ul>
  </details></main>;
}
