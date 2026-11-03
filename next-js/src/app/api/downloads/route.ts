import { getAppDownloads } from "@/server/downloads/catalog";

export const dynamic = "force-dynamic";
export async function GET() {
  return Response.json(await getAppDownloads(), { headers: { "Cache-Control": "no-store" } });
}
