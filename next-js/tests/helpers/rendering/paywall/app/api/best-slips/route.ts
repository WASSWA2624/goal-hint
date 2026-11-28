import { createBestSlipsHandler } from "@/server/slips/best-slips-http";
import { readBestSnapshot } from "../../best";
import { requestAccess } from "../../stored";
export const GET = createBestSlipsHandler({ snapshot: readBestSnapshot, access: requestAccess });
