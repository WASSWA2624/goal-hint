import "server-only";

import { isCanonicalPhone } from "../../domain/phone.ts";
import { readLimitedBody } from "../http/private-http.ts";
import type { MemberVerificationMessage } from "./member-verification-delivery.ts";

export type MemberSms = MemberVerificationMessage;
export type MemberSmsSender = (message: MemberSms) => Promise<void>;
export class SmsUnavailableError extends Error {
  constructor() { super("SMS delivery is unavailable. Try again later."); this.name = "SmsUnavailableError"; }
}

/** SMS Gateway for Android (self-hosted or public server). A real queue acknowledgement is required. */
export function createMemberSmsSender(environment: NodeJS.ProcessEnv = process.env, transport: typeof fetch = fetch): MemberSmsSender {
  const endpoint = environment.GOAL_HINT_SMS_GATEWAY_URL?.trim();
  const token = environment.GOAL_HINT_SMS_TOKEN?.trim();
  const username = environment.GOAL_HINT_SMS_USERNAME?.trim();
  const password = environment.GOAL_HINT_SMS_PASSWORD;
  const authorization = token && !/[\r\n]/u.test(token) ? `Bearer ${token}`
    : username && !/[:\r\n]/u.test(username) && password && !/[\r\n]/u.test(password)
      ? `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}` : null;
  let target: URL | null = null;
  try { target = endpoint ? new URL(endpoint) : null; } catch { /* Invalid private configuration is not echoed. */ }
  const configured = target?.protocol === "https:" && !target.username && !target.password && !target.hash
    && Boolean(authorization);
  return async ({ phone, code, purpose }) => {
    if (!configured || !target || !isCanonicalPhone(phone) || !/^\d{6}$/u.test(code)) throw new SmsUnavailableError();
    const action = purpose === "register" ? "registration" : purpose === "phone" ? "phone change" : purpose === "login" ? "login" : "password change";
    try {
      const response = await transport(target, { method: "POST", redirect: "error", cache: "no-store",
        headers: { Authorization: authorization!, "Content-Type": "application/json" }, signal: AbortSignal.timeout(10_000),
        body: JSON.stringify({ phoneNumbers: [`+${phone}`], textMessage: { text: `Goal Hint ${action} code: ${code}. Expires in 5 minutes. Do not share this code.` }, ttl: 300 }) });
      if (!response.ok) { await response.body?.cancel(); throw new SmsUnavailableError(); }
      // Bound the acknowledgement so a malformed gateway cannot stream an unlimited body into the application.
      const bytes = await readLimitedBody(response, 4096, { deadlineMs: 5_000 });
      if (!bytes) throw new SmsUnavailableError();
      const acknowledgement: unknown = JSON.parse(new TextDecoder().decode(bytes));
      if (!acknowledgement || typeof acknowledgement !== "object" || !("id" in acknowledgement)
        || typeof acknowledgement.id !== "string" || !acknowledgement.id || acknowledgement.id.length > 128
        || !("state" in acknowledgement) || !["Pending", "Processed", "Sent", "Delivered"].includes(acknowledgement.state as string)) throw new SmsUnavailableError();
    } catch { throw new SmsUnavailableError(); }
  };
}
