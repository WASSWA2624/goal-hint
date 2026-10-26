import {adminRoute} from "@/server/admin/admin-http";
import {json} from "@/server/http/private-http";
import {fixtureCodes,seed} from "../../../fixture";
import {codeAction} from "../../../code-actions";
seed();
export const GET=adminRoute(async()=>json({codes:fixtureCodes()}));
export const POST=adminRoute(({request})=>codeAction(request));
