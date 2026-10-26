import { cookies } from "next/headers";
import Link from "next/link";
import { sessions } from "../offline-identity";

export const dynamic = "force-dynamic";
export default async function Page() {
  const member = await sessions.verify((await cookies()).get("goal-hint-member")?.value);
  const identity = member?.phone === "256700000701" ? "A" : member ? "B" : "anonymous";
  return <main data-offline-identity-fixture data-identity={identity}>
    <h1>Goal Hint offline identity acceptance</h1>
    <p>Isolated synthetic identities with the shared offline worker and session verifier.</p>
    {member && <section data-private-fixture>
      <p>synthetic-private-member-{identity}</p><p>{member.phone}</p>
      <p>synthetic-protected-prediction-{identity}</p>
    </section>}
    <Link href="/offline" prefetch={false}>Open saved matches</Link>
  </main>;
}
