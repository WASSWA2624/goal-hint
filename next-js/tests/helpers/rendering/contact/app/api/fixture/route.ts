import { fixture, resetFixture, updateFixture } from "../../fixture";

export async function POST(request: Request) {
  const body = await request.json();
  if (body.reset) resetFixture();
  if (typeof body.unavailable === "boolean") fixture().unavailable = body.unavailable;
  const result = body.changes ? updateFixture(body.changes) : { ok: true };
  return Response.json(result, { status: result.ok ? 200 : 400 });
}
