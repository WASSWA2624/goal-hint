import { adminRoute } from "@/server/admin/admin-http";
import { createReviewHandlers } from "@/server/admin/codes-http";
import { seed } from "../../../../../fixture";
seed();
export const GET = adminRoute(createReviewHandlers().screenshot);
