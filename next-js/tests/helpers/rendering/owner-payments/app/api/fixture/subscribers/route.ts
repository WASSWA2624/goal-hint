import {adminRoute} from "@/server/admin/admin-http";
import {json} from "@/server/http/private-http";
import {fixtureAccountForPhone,fixtureSnapshot,resetFixture,seed} from "../../../fixture";
seed();
export const GET=adminRoute(async()=>json(fixtureSnapshot()));
export const POST=adminRoute(async({request})=>{
  const body = await request.json().catch(() => null);
  resetFixture();
  if (body?.pagination === true) {
    for (let index = 0; index < 26; index++) {
      const account = fixtureAccountForPhone(`120255501${String(index).padStart(2, "0")}`);
      account.ownerNote = "Synthetic paging fixture";
    }
  }
  return json({status:"reset"});
});
