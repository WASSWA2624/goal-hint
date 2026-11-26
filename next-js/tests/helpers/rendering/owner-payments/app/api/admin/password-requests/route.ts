import { seed } from "../../../fixture";
seed();

export { GET, POST } from "@/app/api/admin/password-requests/route";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
