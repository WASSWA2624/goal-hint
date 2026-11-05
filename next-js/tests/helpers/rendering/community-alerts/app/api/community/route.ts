import { publicCommunityLinks } from "@/domain/community";
import { fixture } from "../../fixture-state";
export const dynamic = "force-dynamic";
export function GET() {
  const visible = fixture.settings.communityVisible;
  return Response.json({ visible, links: visible ? publicCommunityLinks(fixture.settings.communityLinks) : [] },
    { headers: { "Cache-Control": "no-store" } });
}
