import { fixture, links } from "../../fixture-state";
export const dynamic = "force-dynamic";
export function GET() { return Response.json({ links: fixture.configured ? links : [] }); }
