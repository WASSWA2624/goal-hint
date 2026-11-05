import { overview, updateFixture } from "../../../fixture";

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = updateFixture(body.changes);
  return parsed.ok ? Response.json(overview()) : Response.json({ error: "invalid", errors: parsed.errors }, { status: 400 });
}
