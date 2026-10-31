import { memberCases, memberWrite } from "../../../fixture";
export function GET() { return Response.json({ cases: memberCases() }); }
export const POST = memberWrite;
