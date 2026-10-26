import { createMemberSignOutHandler } from "@/server/members/member-http";
import { fixtureServices } from "../../../fixture";
export const POST = createMemberSignOutHandler(async () => fixtureServices());
