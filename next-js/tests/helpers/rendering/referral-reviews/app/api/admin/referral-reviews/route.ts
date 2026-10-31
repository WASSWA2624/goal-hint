import { adminWrite, cases } from "../../../fixture";
export function GET() { return Response.json({ cases: cases() }); }
export const POST = adminWrite;
