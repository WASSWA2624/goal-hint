import { createBestSlipsHandler } from "@/server/slips/best-slips-http";
import { readCompletedBest } from "../../best";
import { requestAccess } from "../../stored";

export const GET = createBestSlipsHandler({ read: readCompletedBest, access: requestAccess });
