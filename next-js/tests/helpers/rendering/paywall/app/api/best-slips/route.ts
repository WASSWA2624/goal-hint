import { createBestSlipsHandler } from "@/server/slips/best-slips-http";
import { readBest } from "../../best";
import { requestAccess } from "../../stored";
export const GET = createBestSlipsHandler({ read: readBest, access: requestAccess });
