import { alertStatus } from "../../../fixture-state";
export const dynamic = "force-dynamic";
export function GET() { return Response.json(alertStatus()); }
