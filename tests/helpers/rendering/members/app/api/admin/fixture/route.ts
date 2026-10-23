import { adminRoute } from "@/server/admin/admin-http";
import { fixtureAdminServices } from "../../../fixture-admin";

export const GET = adminRoute(async () => Response.json({ administrator: true }, { headers: { "Cache-Control": "no-store" } }), { services: fixtureAdminServices });
