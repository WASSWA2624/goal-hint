import "server-only";
import { publicContactPageSettings } from "../../domain/contact-page.ts";
import type { SettingsState } from "./settings.ts";

/** Only contacts explicitly published for this page leave the server. */
export function createContactHandler(settings: () => Promise<SettingsState | null>) {
  return async function GET() {
    const headers = { "Cache-Control": "no-store" };
    try {
      const state = await settings();
      if (!state?.settings || state.source === "last-good") throw new Error("Contact settings unavailable.");
      return Response.json(publicContactPageSettings(state.settings), { headers });
    } catch {
      return Response.json({ error: "Contact details are temporarily unavailable." }, { status: 503, headers });
    }
  };
}
