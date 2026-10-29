import { fixtureShared, scenarios } from "../../../../data";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const shared = scenarios.map(scenario => fixtureShared(scenario)).find(value => value.id === id);
  return shared ? Response.json(shared) : Response.json({ error: "not-found" }, { status: 404 });
}
