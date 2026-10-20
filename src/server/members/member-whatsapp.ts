import "server-only";

import { isCanonicalPhone } from "../../domain/phone.ts";
import { readLimitedBody } from "../http/private-http.ts";
import type { MemberVerificationMessage } from "./member-verification-delivery.ts";

export type MemberWhatsAppSender = (message: MemberVerificationMessage) => Promise<void>;
export class WhatsAppUnavailableError extends Error {
  constructor() { super("WhatsApp delivery is unavailable. Try again later."); this.name = "WhatsAppUnavailableError"; }
}

/** Official Meta Cloud API authentication template with a copy-code button; no consumer WhatsApp automation. */
export function createMemberWhatsAppSender(environment: NodeJS.ProcessEnv = process.env, transport: typeof fetch = fetch): MemberWhatsAppSender {
  const token = environment.GOAL_HINT_WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = environment.GOAL_HINT_WHATSAPP_PHONE_NUMBER_ID?.trim();
  const templateName = environment.GOAL_HINT_WHATSAPP_TEMPLATE_NAME?.trim();
  const language = environment.GOAL_HINT_WHATSAPP_TEMPLATE_LANGUAGE?.trim();
  const version = environment.GOAL_HINT_WHATSAPP_API_VERSION?.trim() || "v25.0";
  const configured = token && token.length <= 8192 && /^[^\s\0]+$/u.test(token)
    && phoneNumberId && /^[1-9]\d{0,31}$/u.test(phoneNumberId)
    && templateName && /^[a-z0-9_]{1,512}$/u.test(templateName)
    && language && /^[a-z]{2,3}(?:_[A-Z]{2})?$/u.test(language) && /^v[1-9]\d{0,2}\.0$/u.test(version);
  return async ({ phone, code }) => {
    if (!configured || !isCanonicalPhone(phone) || !/^\d{6}$/u.test(code)) throw new WhatsAppUnavailableError();
    try {
      const response = await transport(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
        method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10_000),
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: phone, type: "template",
          template: { name: templateName, language: { code: language }, components: [
            { type: "body", parameters: [{ type: "text", text: code }] },
            { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] },
          ] } }),
      });
      if (!response.ok) { await response.body?.cancel(); throw new WhatsAppUnavailableError(); }
      const bytes = await readLimitedBody(response, 8192, { deadlineMs: 5_000 });
      if (!bytes) throw new WhatsAppUnavailableError();
      const acknowledgement: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      if (!acknowledgement || typeof acknowledgement !== "object" || !("messaging_product" in acknowledgement)
        || acknowledgement.messaging_product !== "whatsapp" || !("messages" in acknowledgement)
        || !Array.isArray(acknowledgement.messages) || acknowledgement.messages.length !== 1) throw new WhatsAppUnavailableError();
      const message: unknown = acknowledgement.messages[0];
      if (!message || typeof message !== "object" || !("id" in message) || typeof message.id !== "string"
        || !message.id.trim() || message.id.length > 512 || "message_status" in message && message.message_status !== "accepted") throw new WhatsAppUnavailableError();
    } catch { throw new WhatsAppUnavailableError(); }
  };
}
