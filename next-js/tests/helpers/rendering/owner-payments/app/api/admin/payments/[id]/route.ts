import {adminRoute} from "@/server/admin/admin-http";
import {createReviewHandlers} from "@/server/admin/codes-http";
import {seed} from "../../../../fixture";
import {paymentAction} from "../../../../payment-actions";
seed();
export const GET=adminRoute(createReviewHandlers().GET);
export const POST=adminRoute(({request})=>paymentAction(request));
