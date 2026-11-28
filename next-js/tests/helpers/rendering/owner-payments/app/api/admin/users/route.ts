import {adminRoute} from "@/server/admin/admin-http";
import {createUserHandlers} from "@/server/admin/users-http";
import {seed} from "../../../fixture";
seed();
export const POST=adminRoute(createUserHandlers().POST);
