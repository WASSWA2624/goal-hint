import "server-only";
import { publicCommunityLinks } from "../../domain/community.ts";
import type { SettingsState } from "./settings.ts";

/** Community is public, but a failed settings read must never restore hidden destinations. */
export function createCommunityHandler(settings: () => Promise<SettingsState | null>) {
  return async function GET() {
    const headers = { "Cache-Control": "no-store" };
    try {
      const state = await settings();
      if (!state?.settings || state.source === "last-good") throw new Error("Community settings unavailable.");
      const visible = state.settings.communityVisible;
      return Response.json({ visible, links: visible ? publicCommunityLinks(state.settings.communityLinks) : [] }, { headers });
    } catch {
      return Response.json({ error: "Community is temporarily unavailable." }, { status: 503, headers });
    }
  };
}
