import { createBestSlipsHandler } from "@/server/slips/best-slips-http";
import { readCompletedBestSnapshot } from "../../best";
import { requestAccess } from "../../stored";

export const GET = createBestSlipsHandler({ snapshot: readCompletedBestSnapshot, access: requestAccess });
