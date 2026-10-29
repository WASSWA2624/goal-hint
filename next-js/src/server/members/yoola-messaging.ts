import "server-only";

import { supportedMessageChannels, verificationCodeLifetimeMs, type MessageChannel, type VerificationPurpose } from "../../domain/member-verification.ts";
import { defaultMessageTemplates, renderMessageTemplate } from "../../domain/message-templates.ts";
import { sharedMessageValues, type MessagingSettingsReader } from "./message-content.ts";

export type VerificationMessage = Readonly<{ phone: string; channel: MessageChannel; purpose: VerificationPurpose; code: string }>;
export type MemberMessaging = Readonly<{ send(message: VerificationMessage): Promise<void> }>;
export type SmsMessage = Readonly<{ phone: string; message: string }>;
/** configured() is optional for injected fakes; a missing method counts as configured. */
export type WhatsAppMessage = Readonly<{ phone: string; templateName: string; parameters: readonly string[]; consent: true }>;
export type SmsMessaging = Readonly<{ sendSms(message: SmsMessage): Promise<void>; sendWhatsApp?(message: WhatsAppMessage): Promise<void>; configured?(): boolean }>;
type MessagingErrorCode = "invalid-message" | "unsupported-country" | "configuration" | "delivery";
/**
 * `not-sent` failed local validation before dispatch. Provider/transport failures are `uncertain`: the gateway's HTTP or
 * response status does not establish a verified idempotency, billing or non-delivery contract.
 */
export type MessagingDispatch = "not-sent" | "uncertain";

const errorMessages: Readonly<Record<MessagingErrorCode, string>> = Object.freeze({
  "invalid-message": "The message is invalid.",
  "unsupported-country": "This delivery channel is not supported for the registered number.",
  configuration: "Messaging is not configured. Please contact the administrator.",
  delivery: "The message could not be sent. Please try again later.",
});

/** Never attach provider responses or request details: they may contain credentials, phone numbers or codes. */
export class YoolaMessagingError extends Error {
  readonly code: MessagingErrorCode;
  readonly dispatch: MessagingDispatch;
  constructor(code: MessagingErrorCode, dispatch: MessagingDispatch = code === "delivery" ? "uncertain" : "not-sent") {
    super(errorMessages[code]);
    this.name = "YoolaMessagingError";
    this.code = code;
    this.dispatch = dispatch;
  }
}

/**
 * Delivery only: Goal Hint owns code generation, expiry, usage and request limits. Yoola Verify's fixed ten-minute
 * lifetime does not implement our 24-hour rule, so use SMS send and the approved WhatsApp authentication template.
 * Calling send with channel=whatsapp must follow the recipient's explicit choice to receive that message on WhatsApp.
 */
export function createYoolaMessaging({ env = process.env, fetch: request = globalThis.fetch, settings: readSettings }: {
  env?: Readonly<Record<string, string | undefined>>; fetch?: typeof globalThis.fetch; settings?: MessagingSettingsReader;
} = {}): MemberMessaging & SmsMessaging {
  function credentials() {
    const apiKey = env.YOOLA_SMS_API_KEY?.trim(), sender = env.YOOLA_SMS_SENDER?.trim();
    return !apiKey || (sender && !/^[a-z\d]+$/iu.test(sender)) ? null : { apiKey, sender };
  }

  async function deliver(phone: string, channel: MessageChannel, payload: Readonly<Record<string, unknown>>): Promise<void> {
    if (!supportedMessageChannels(phone).includes(channel)) throw new YoolaMessagingError("unsupported-country");
    const configured = credentials();
    if (!configured) throw new YoolaMessagingError("configuration");
    const { apiKey, sender } = configured, endpoint = channel === "sms" ? "send" : "send-whatsapp";
    // No automatic retries here: an uncertain result could already have delivered and charged for this message. Each failure
    // is classified once without provider text. No response failure authorizes an automatic resend.
    let response: Response;
    try {
      response = await request(`https://yoolasms.com/api/v1/${endpoint}`, {
        method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ api_key: apiKey, phone, ...payload, ...(channel === "sms" && sender ? { sender } : {}) }),
        signal: AbortSignal.timeout(10_000), redirect: "error", cache: "no-store",
      });
    } catch { throw new YoolaMessagingError("delivery", "uncertain"); }
    if (!response.ok) throw new YoolaMessagingError("delivery", "uncertain");
    let status: string | null;
    try {
      const result: unknown = await response.json();
      status = result && typeof result === "object" && "status" in result ? String(result.status) : null;
    } catch { throw new YoolaMessagingError("delivery", "uncertain"); }
    if (status === "success" || status === "queued") return;
    throw new YoolaMessagingError("delivery", "uncertain");
  }

  async function sendSms({ phone, message }: SmsMessage): Promise<void> {
    if (typeof message !== "string" || !message.trim() || message.length > 1_600) throw new YoolaMessagingError("invalid-message");
    await deliver(phone, "sms", { message });
  }

  async function sendWhatsApp({ phone, templateName, parameters, consent }: WhatsAppMessage): Promise<void> {
    if (consent !== true || !/^[a-z0-9_]{1,128}$/u.test(templateName) || !Array.isArray(parameters) || parameters.length > 20
      || parameters.some(value => typeof value !== "string" || !value.trim() || value.length > 1_600)) throw new YoolaMessagingError("invalid-message");
    await deliver(phone, "whatsapp", { template_name: templateName, template_params: parameters, consent: "yes" });
  }

  return Object.freeze({
    sendSms,
    sendWhatsApp,
    /** The same key and sender rule delivery checks, without a request: an unconfigured process leaves outbox rows alone. */
    configured: () => credentials() !== null,
    async send({ phone, channel, purpose, code }: VerificationMessage): Promise<void> {
      if (typeof code !== "string" || !/^\d{6}$/u.test(code) || !["account", "password-reset"].includes(purpose) || !["sms", "whatsapp"].includes(channel)) {
        throw new YoolaMessagingError("invalid-message");
      }
      const settings = readSettings ? await readSettings() : null;
      if (readSettings && !settings) throw new YoolaMessagingError("configuration");
      const event = purpose === "account" ? "account-verification" : "password-reset";
      const template = (settings?.messageTemplates ?? defaultMessageTemplates).events[event];
      if (!template.enabled || !template.channels.includes(channel)) throw new YoolaMessagingError("configuration");
      const values = { ...sharedMessageValues(settings, phone), verification_code: code, expiry_hours: String(verificationCodeLifetimeMs / 3_600_000) };
      if (channel === "sms") {
        await sendSms({ phone, message: renderMessageTemplate(event, template.sms, values) });
      } else {
        await sendWhatsApp({ phone, templateName: template.whatsapp.templateName,
          parameters: template.whatsapp.parameters.map(source => renderMessageTemplate(event, source, values)), consent: true });
      }
    },
  });
}
