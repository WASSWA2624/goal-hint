import { notFound } from "next/navigation";
import FixturePage from "../../fixture-page";
export { metadata } from "../../fixture-page";
export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  if ((await params).id !== "e".repeat(32)) notFound();
  return <FixturePage params={Promise.resolve({ scenario: "shared" })} />;
}
