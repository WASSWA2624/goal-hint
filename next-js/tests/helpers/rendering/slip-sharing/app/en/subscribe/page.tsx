import { cookies } from "next/headers";
import { createSubscribeRoute } from "@/app/_components/subscribe-route";
import { fixturePlan, journeyServices } from "../../journey";
const Route = createSubscribeRoute({ services: async () => journeyServices((await cookies()).get("fixture-sharing-viewer")?.value), plans: async () => [fixturePlan] });
export default async function Page({ searchParams }: { searchParams: Promise<Record<string,string|undefined>> }) {
  return <Route locale="en" searchParams={searchParams} />;
}
