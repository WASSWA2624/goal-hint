import { badgeParameters, loadProviderBadge } from "@/server/images/provider-badge";

export const dynamic = "force-static";
export const revalidate = 604800;

export async function GET(_request: Request, { params }: { params: Promise<{ kind: string; id: string; size: string }> }) {
  const { kind, id, size } = await params, badge = badgeParameters(kind, id, size);
  if (!badge) return new Response(null, { status: 404 });
  try {
    const body = await loadProviderBadge(badge.source, badge.width);
    return new Response(new Uint8Array(body), { headers: { "Content-Type": "image/webp", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return new Response(null, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
