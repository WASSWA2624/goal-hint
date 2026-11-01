import { confirm, quote, view } from "../../../fixture";
export const dynamic = "force-dynamic";
export function GET() { return Response.json(view()); }
export async function POST(request: Request) {
  const form = await request.formData(), body = JSON.parse(String(form.get("payload")));
  if (body.action === "quote") return Response.json(quote(body.selection));
  if (body.action === "confirm") return Response.json(confirm(body.selection, body.requestKey, body.proof));
  if (body.action === "cancel") { const r = view().requests.find(r => r.id === body.id); if (r) r.status = "cancelled"; return Response.json(r); }
  return Response.json({ message: "Synthetic fixture action unavailable" }, { status: 400 });
}
