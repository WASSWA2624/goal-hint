import {adminRoute} from "@/server/admin/admin-http";
import {json} from "@/server/http/private-http";
import {fixtureSnapshot,resetFixture,seed} from "../../../fixture";
seed();
export const GET=adminRoute(async()=>json(fixtureSnapshot()));
export const POST=adminRoute(async()=>{resetFixture();return json({status:"reset"});});
