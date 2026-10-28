import "server-only";

import { demoApiFootballResponse } from "@/server/demo/api-football";

/** Inspect the actual synthetic provider contract without enabling a live API key. */
export async function GET(request: Request, context: { params: Promise<{ endpoint: string[] }> }) {
  if (process.env.NODE_ENV !== "development" || process.env.NEXT_PUBLIC_GOAL_HINT_DEMO !== "true") {
    return new Response(null, { status: 404 });
  }
  const { endpoint } = await context.params;
  const parameters = Object.fromEntries(new URL(request.url).searchParams);
  return Response.json(demoApiFootballResponse(endpoint.join("/"), parameters, Date.now()), {
    headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
  });
}
