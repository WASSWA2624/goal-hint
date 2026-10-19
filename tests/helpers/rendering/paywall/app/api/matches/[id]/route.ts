import { createMatchDetailHandler } from "@/server/matches/detail-http";
import { readDetail, requestAccess } from "../../../stored";
export const GET = createMatchDetailHandler(readDetail, requestAccess);
