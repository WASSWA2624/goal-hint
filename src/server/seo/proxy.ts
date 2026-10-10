import "server-only";
import { NextResponse, type NextRequest } from "next/server.js";
import { getLocaleRedirect } from "../../i18n/locales.ts";
import { getDiscoveryPolicy } from "./policy.ts";

export function createDiscoveryProxy(policy = getDiscoveryPolicy) {
  return (request: NextRequest) => {
    const pathname = getLocaleRedirect(request.nextUrl.pathname);
    const destination = request.nextUrl.clone();
    if (pathname) destination.pathname = pathname;
    const response = pathname ? NextResponse.redirect(destination) : NextResponse.next();
    if (!policy().index) response.headers.set("X-Robots-Tag", "noindex, follow");
    return response;
  };
}
