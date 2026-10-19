import {adminRoute,readJsonBody} from "@/server/admin/admin-http";
import {json} from "@/server/http/private-http";
import {seed,accountId} from "../../../../fixture";
seed();
export const POST=adminRoute(async({request})=>{const read=await readJsonBody(request);if("refusal" in read)return read.refusal;return json({accounts:[{id:accountId,phone:"256700000101",status:"open",lastSignInAt:"2026-10-19T09:00:00Z"}],status:"saved"});});
