import { NextResponse, type NextRequest } from "next/server";
import { getLocaleRedirect } from "@/i18n/locales";

export function proxy(request: NextRequest) {
  const pathname = getLocaleRedirect(request.nextUrl.pathname);
  if (!pathname) return NextResponse.next();
  const destination = request.nextUrl.clone();
  destination.pathname = pathname;
  return NextResponse.redirect(destination);
}

export const config = {
  matcher: ["/((?!api(?:/|$)|_next(?:/|$)|brand(?:/|$)|.*\\.).*)"],
};
