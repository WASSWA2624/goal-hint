import { adminRoute } from "@/server/admin/admin-http";
import { seed } from "../../../../fixture";
import { userBulkAction } from "../../../../user-actions";

seed();
export const POST = adminRoute(({ request }) => userBulkAction(request));
