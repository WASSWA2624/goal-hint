import {adminRoute,readJsonBody} from "@/server/admin/admin-http";
import {json} from "@/server/http/private-http";
import {seed,searchSubscribers} from "../../../fixture";
seed();
export const POST=adminRoute(async({request})=>{
 const read=await readJsonBody(request);if("refusal" in read)return read.refusal;
 if(typeof read.body.search!=="string"||read.body.search.length>40)return json({message:"Enter a phone number to search."},400);
 return json({accounts:searchSubscribers(read.body.search)});
});
