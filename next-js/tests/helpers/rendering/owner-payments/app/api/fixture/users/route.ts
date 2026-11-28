import {adminRoute} from "@/server/admin/admin-http";
import {json} from "@/server/http/private-http";
import {fixtureAccountForPhone,fixtureSnapshot,fixtureState,resetFixture,seed} from "../../../fixture";
seed();
export const GET=adminRoute(async()=>json(fixtureSnapshot()));
export const POST=adminRoute(async({request})=>{
  const body = await request.json().catch(() => null);
  if (body && typeof body === "object" && "failure" in body && (body.failure === "list" || body.failure === "detail" || body.failure === null)) {
    fixtureState().userFailure = body.failure;
    return json({ status: "saved" });
  }
  resetFixture();
  if (body?.pagination === true) {
    for (let index = 0; index < 201; index++) {
      const area = [202, 212, 312][Math.floor(index / 100)];
      const account = fixtureAccountForPhone(`1${area}55501${String(index % 100).padStart(2, "0")}`);
      account.ownerNote = "Synthetic paging fixture";
    }
  }
  return json({status:"reset"});
});
