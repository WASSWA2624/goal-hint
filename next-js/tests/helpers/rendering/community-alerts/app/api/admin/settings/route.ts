import { fixture, settingsPage } from "../../../fixture-state";
export async function POST(request: Request) {
  const body = await request.json(); fixture.settings = { ...fixture.settings, ...body.changes };
  return Response.json({ status: "saved", ...settingsPage() });
}
