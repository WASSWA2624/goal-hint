import { createMemberSignInHandler } from "@/server/members/member-http";
import { fixtureServices } from "../../../fixture";
export const POST = createMemberSignInHandler(async () => fixtureServices());
