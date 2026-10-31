import { cookies } from "next/headers";
import { createSharedSlipRoute, sharedSlipMetadata } from "@/app/_components/shared-slip-route";
import { fixtureLanding } from "../../recipient";
export const metadata = sharedSlipMetadata;
export default createSharedSlipRoute(async id => fixtureLanding(id, (await cookies()).get("fixture-sharing-viewer")?.value));
