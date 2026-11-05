import { applySettingsChanges, parseSettingsChanges } from "@/domain/subscription-settings";
import { fixture, settingsPage } from "../../../fixture-state";
export async function POST(request: Request) {
  if (fixture.role !== "admin") return Response.json({ error: "forbidden" }, { status: 403 });
  const body = await request.json();
  if (body.action !== "save") return Response.json({ error: "invalid" }, { status: 400 });
  const parsed = parseSettingsChanges(body.changes);
  if (!parsed.ok) return Response.json({ error: "invalid", errors: parsed.errors }, { status: 400 });
  const applied = applySettingsChanges(fixture.settings, parsed.changes);
  if (!applied.ok) return Response.json({ error: "invalid", errors: applied.errors }, { status: 400 });
  fixture.settings = { ...applied.change.next, updatedAt: new Date().toISOString(), updatedBy: "fixture-admin" };
  return Response.json({ status: "saved", ...settingsPage() });
}
