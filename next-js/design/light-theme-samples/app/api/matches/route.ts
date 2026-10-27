import { previewFeed } from "../../fixture-data";

export function GET(request: Request) {
  const parameters = Object.fromEntries(new URL(request.url).searchParams);
  return Response.json(previewFeed(parameters).result.data, { headers: { "Cache-Control": "no-store" } });
}
