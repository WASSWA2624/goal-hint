import {adminRoute} from "@/server/admin/admin-http";
import {json} from "@/server/http/private-http";
import {seed} from "../../../fixture";
import {paymentAction} from "../../../payment-actions";
seed();
export const GET=adminRoute(async()=>json({pendingCount:1}));
export const POST=adminRoute(({request})=>paymentAction(request));
