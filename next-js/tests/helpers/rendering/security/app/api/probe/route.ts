import { clientAddress, isSameOrigin } from "@/server/http/private-http";
export function GET(request: Request) {
  return Response.json({ address: clientAddress(request.headers), sameOrigin: isSameOrigin(request) }, { headers: { "Cache-Control": "no-store" } });
}
