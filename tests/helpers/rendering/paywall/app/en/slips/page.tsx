import { createSlipsRoute } from "@/app/_components/slips-route";
import { instant, resolveAccess } from "../../stored";
export const dynamic = "force-dynamic";
const route = createSlipsRoute({ instant, resolveAccess, read: async () => { throw Error("A free slip request must not read."); } });
export default route.Page;
