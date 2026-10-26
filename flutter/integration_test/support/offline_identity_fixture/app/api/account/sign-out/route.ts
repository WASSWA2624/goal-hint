import { createMemberSignOutHandler } from "@/server/members/member-http";
import { source } from "../../../offline-identity";

export const POST = createMemberSignOutHandler(source, async () => ({ auth: null }));
