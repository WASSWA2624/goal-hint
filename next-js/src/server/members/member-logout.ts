import "server-only";

import { logoutUnconfirmedStatus, memberLoginPath } from "../../domain/member-navigation.ts";
import { authCopy } from "../../i18n/messages/auth.ts";
import { json, redirect } from "../http/private-http.ts";

export async function revokeLogoutSession(token: string | undefined, revoke?: (token: string) => Promise<unknown>): Promise<boolean> {
  if (!token) return true;
  if (!revoke) return false;
  try {
    await revoke(token);
    return true;
  } catch {
    return false;
  }
}

export function memberLogoutResponse(request: Request, next: string, cleared: string[], confirmed: boolean): Response {
  if (!confirmed) next = `${next.includes("?") ? next : memberLoginPath}&status=${logoutUnconfirmedStatus}`;
  const wantsJson = (request.headers.get("accept") ?? "").includes("application/json")
    || /^application\/json(?:;|$)/iu.test(request.headers.get("content-type") ?? "");
  const body = { next, phone: null };
  const response = wantsJson
    ? confirmed ? json(body) : json({ ...body, error: logoutUnconfirmedStatus, message: authCopy.logoutUnconfirmed }, 503)
    : redirect(next);
  for (const value of cleared) response.headers.append("Set-Cookie", value);
  response.headers.set("Clear-Site-Data", '"cache"');
  return response;
}
