import { createOwnerLogoutHandler } from "@/server/admin/owner-auth";
import { fixtureAdminServices } from "../../../fixture-admin";
export const POST = createOwnerLogoutHandler({ services: fixtureAdminServices, audit: () => {} });
