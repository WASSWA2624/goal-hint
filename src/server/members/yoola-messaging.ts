import "server-only";

import { supportedMessageChannels, type MessageChannel, type VerificationPurpose } from "../../domain/member-verification.ts";

export type VerificationMessage = Readonly<{ phone: string; channel: MessageChannel; purpose: VerificationPurpose; code: string }>;
export type MemberMessaging = Readonly<{ send(message: VerificationMessage): Promise<void> }>;
export type SmsMessage = Readonly<{ phone: string; message: string }>;
export type SmsMessaging = Readonly<{ sendSms(message: SmsMessage): Promise<void> }>;
type MessagingErrorCode = "invalid-message" | "unsupported-country" | "configuration" | "delivery";

const errorMessages: Readonly<Record<MessagingErrorCode, string>> = Object.freeze({
  "invalid-message": "The message is invalid.",
  "unsupported-country": "This delivery channel is not supported for the registered number.",
  configuration: "Messaging is not configured. Please contact the administrator.",
  delivery: "The message could not be sent. Please try again later.",
});

/** Never attach provider responses or request details: they may contain credentials, phone numbers or codes. */
export class YoolaMessagingError extends Error {
  readonly code: MessagingErrorCode;
  constructor(code: MessagingErrorCode) {
    super(errorMessages[code]);
    this.name = "YoolaMessagingError";
    this.code = code;
  }
}

/**
 * Delivery only: Goal Hint owns code generation, expiry, usage and request limits. Yoola Verify's fixed ten-minute
 * lifetime does not implement our 24-hour rule, so use SMS send and the approved WhatsApp authentication template.
 * Calling send with channel=whatsapp must follow the recipient's explicit choice to receive that message on WhatsApp.
 */
export function createYoolaMessaging({ env = process.env, fetch: request = globalThis.fetch }: {
  env?: Readonly<Record<string, string | undefined>>; fetch?: typeof globalThis.fetch;
} = {}): MemberMessaging & SmsMessaging {
  async function deliver(phone: string, channel: MessageChannel, payload: Readonly<Record<string, unknown>>): Promise<void> {
    if (!supportedMessageChannels(phone).includes(channel)) throw new YoolaMessagingError("unsupported-country");
    const apiKey = env.YOOLA_SMS_API_KEY?.trim(), sender = env.YOOLA_SMS_SENDER?.trim();
    if (!apiKey || (sender && !/^[a-z\d]+$/iu.test(sender))) throw new YoolaMessagingError("configuration");
    const endpoint = channel === "sms" ? "send" : "send-whatsapp";
    try {
      const response = await request(`https://yoolasms.com/api/v1/${endpoint}`, {
        method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ api_key: apiKey, phone, ...payload, ...(channel === "sms" && sender ? { sender } : {}) }),
        signal: AbortSignal.timeout(10_000), redirect: "error", cache: "no-store",
      });
      if (!response.ok) throw new YoolaMessagingError("delivery");
      const result: unknown = await response.json();
      if (!result || typeof result !== "object" || !("status" in result) || !["success", "queued"].includes(String(result.status))) {
        throw new YoolaMessagingError("delivery");
      }
    } catch {
      // No automatic retries: an uncertain network result could already have delivered and charged for this message.
      throw new YoolaMessagingError("delivery");
    }
  }

  async function sendSms({ phone, message }: SmsMessage): Promise<void> {
    if (typeof message !== "string" || !message.trim() || message.length > 1_600) throw new YoolaMessagingError("invalid-message");
    await deliver(phone, "sms", { message });
  }

  return Object.freeze({
    sendSms,
    async send({ phone, channel, purpose, code }: VerificationMessage): Promise<void> {
      if (typeof code !== "string" || !/^\d{6}$/u.test(code) || !["account", "password-reset"].includes(purpose) || !["sms", "whatsapp"].includes(channel)) {
        throw new YoolaMessagingError("invalid-message");
      }
      if (channel === "sms") {
        await sendSms({ phone, message: `Goal Hint ${purpose === "account" ? "account verification" : "password reset"} code: ${code}. Valid for 24 hours. Do not share this code.` });
      } else {
        await deliver(phone, "whatsapp", { template_name: "yoola_otp_verification", template_params: [code], consent: "yes" });
      }
    },
  });
}
