import { PublicShell } from "@/app/_components/public-shell";

/** Exercise payment discoverability outside the dashboard without providers or business storage. */
export default function Page() {
  return <PublicShell locale="en" showAccount><section data-fixture-public><h1>Goal Hint</h1>
    <p>Synthetic administrator navigation preview.</p></section></PublicShell>;
}
