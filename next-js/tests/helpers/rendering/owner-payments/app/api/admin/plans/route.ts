import { seed } from "../../../fixture";
seed();
// Exercise the production owner guard, validation, transactions and audit writer.
export { GET, POST } from "@/app/api/admin/plans/route";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
