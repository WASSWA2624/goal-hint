import { createAccountRoute } from "@/app/_components/account-route";
import { services } from "../../fixture";

const Account = createAccountRoute({ services, plans: async () => [] });
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <Account locale="en" searchParams={searchParams} />;
}
