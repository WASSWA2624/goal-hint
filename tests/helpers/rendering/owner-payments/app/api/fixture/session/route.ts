import { fixtureAdminToken } from "../../../fixture";

/** Establishes only this isolated app's synthetic member cookie; no account, credential or business storage is used. */
export function GET() {
  return new Response(null, { status: 303, headers: { Location: "/admin/subscribers?accountId=00000000-0000-4000-8000-000000000100",
    "Set-Cookie": `goal-hint-member=${fixtureAdminToken}; Path=/; HttpOnly; SameSite=Lax`, "Cache-Control": "no-store" } });
}
