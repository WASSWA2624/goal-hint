import { cookies } from "next/headers";
import { verifyAdminSession } from "@/server/analytics/analytics-http";
import { redirectToAccountLogin } from "@/server/members/account-login-redirect";
import { fixtureAdminServices } from "../fixture-admin";

export const dynamic = "force-dynamic";
export default async function Page() {
  const jar = await cookies(), services = await fixtureAdminServices();
  const admin = await verifyAdminSession(services, jar.get("goal-hint-member")?.value);
  if (!admin) redirectToAccountLogin();
  return <main data-fixture-analytics><h1>Synthetic analytics dashboard</h1>
    <form method="post" action="/api/account/sign-out"><button type="submit">Log out</button></form></main>;
}
