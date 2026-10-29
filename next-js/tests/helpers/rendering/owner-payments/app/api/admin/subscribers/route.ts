import {adminRoute} from "@/server/admin/admin-http";
import {createSubscriberHandlers} from "@/server/admin/subscribers-http";
import {seed} from "../../../fixture";
seed();
export const POST=adminRoute(createSubscriberHandlers().POST);
