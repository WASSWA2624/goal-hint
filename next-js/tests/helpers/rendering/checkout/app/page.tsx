import { CheckoutFlow } from "@/components/members/checkout-flow";
import { SubscribeLayout } from "@/components/members/subscribe-styles";
import { plans, settings, view } from "./fixture";
export const dynamic = "force-dynamic";
export default function Page() {
  return <main><h1>Goal Hint · payment acceptance</h1><p>Synthetic fixture. Never send money.</p><SubscribeLayout>
    <CheckoutFlow locale="en" settings={settings} plans={plans} account={{ id: "11111111-1111-4111-8111-111111111111", phone: "256700000101" }} initialView={view()} />
  </SubscribeLayout></main>;
}
