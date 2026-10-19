import {adminRoute,readJsonBody} from "@/server/admin/admin-http";
import {json} from "@/server/http/private-http";
import {codeDelivery} from "@/domain/code-delivery";
import {seed} from "../../../../fixture";
seed();
export const GET=adminRoute(async()=>json({pendingCount:1}));
export const POST=adminRoute(async({request})=>{const read=await readJsonBody(request);if("refusal" in read)return read.refusal;if(["trial","manual","approve","reissue"].includes(String(read.body.action))) return json({delivery:codeDelivery({phone:"256700000101",code:"0123-4567-89AB",reference:"C-TEST",planName:"Weekly",endsAt:new Date("2026-11-01T18:00:00Z"),renewal:false,source:read.body.action==="trial"?"trial":"payment"},new URL(request.url).origin)});return json({status:"saved"});});
