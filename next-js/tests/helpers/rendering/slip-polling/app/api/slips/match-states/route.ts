import { createSlipMatchStatesHandler } from "@/server/slips/slip-match-states";
import { observed, viewer } from "../../../data";
export const POST = createSlipMatchStatesHandler({ access: async request => viewer(request.headers.get("cookie")),
  read: async (selections, request) => observed(selections, request.headers.get("cookie")) });
