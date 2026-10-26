import { cookies } from "next/headers";
import Link from "next/link";

export const dynamic = "force-dynamic";
export default async function Page() {
  const identity = (await cookies()).get("offline-fixture-identity")?.value;
  return <main data-offline-fixture><h1>Goal Hint offline acceptance</h1>
    <p>Isolated synthetic public fixture.</p>
    {identity && <p data-private-fixture>synthetic-private-member-{identity}</p>}
    <Link href="/offline" prefetch={false}>Open saved matches</Link>
    <form method="post" action="/api/account/fixture"><label>Draft<input name="draft" /></label><button>Submit synthetic action</button></form>
  </main>;
}
