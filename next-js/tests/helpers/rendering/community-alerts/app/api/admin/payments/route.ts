import { alertStatus } from "../../../fixture-state";
export const dynamic = "force-dynamic";
export function GET() { return Response.json({ pendingCount: 0, reviewAlerts: alertStatus() }); }
