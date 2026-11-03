import { appDownloadResponse } from "@/server/downloads/file-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ platform: string }> }) {
  return appDownloadResponse(request, (await params).platform);
}
export const HEAD = GET;
