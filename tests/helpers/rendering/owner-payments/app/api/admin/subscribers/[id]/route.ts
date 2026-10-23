import {adminRoute} from "@/server/admin/admin-http";
import {seed} from "../../../../fixture";
import {subscriberAction} from "../../../../subscriber-actions";
seed();
export const POST=adminRoute(({request})=>subscriberAction(request));
