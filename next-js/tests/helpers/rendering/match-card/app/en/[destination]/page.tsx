import { notFound } from "next/navigation";

export default async function AccessDestination({ params }: { params: Promise<{ destination: string }> }) {
  const { destination } = await params;
  if (destination === "account") return <h1>Fixture sign-in destination</h1>;
  if (destination === "subscribe") return <h1>Fixture payments destination</h1>;
  notFound();
}
