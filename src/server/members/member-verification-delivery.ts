import "server-only";

import { createMemberSmsSender } from "./member-sms.ts";
import { createMemberWhatsAppSender } from "./member-whatsapp.ts";

export type VerificationChannel = "whatsapp" | "sms";
export type VerificationPurpose = "register" | "reset" | "phone" | "password" | "login";
export type MemberVerificationMessage = Readonly<{ phone: string; code: string; purpose: VerificationPurpose }>;
export type MemberVerificationSender = (message: MemberVerificationMessage & { channel: VerificationChannel }) => Promise<void>;

export function verificationChannel(value: unknown): VerificationChannel | null {
  return value === undefined ? "whatsapp" : value === "whatsapp" || value === "sms" ? value : null;
}

export const verificationDeliveryFailure = (channel: VerificationChannel) => channel === "whatsapp"
  ? "WhatsApp delivery is unavailable. Check that this number uses WhatsApp, or choose SMS."
  : "SMS delivery is unavailable. Try again later or choose WhatsApp.";

/** Each challenge uses exactly the requested provider. A delivery failure never changes channels. */
export function createMemberVerificationSender(environment: NodeJS.ProcessEnv = process.env, transport: typeof fetch = fetch): MemberVerificationSender {
  const whatsapp = createMemberWhatsAppSender(environment, transport), sms = createMemberSmsSender(environment, transport);
  return async ({ channel, ...message }) => {
    if (channel === "whatsapp") await whatsapp(message);
    else if (channel === "sms") await sms(message);
    else throw new Error("Choose WhatsApp or SMS for verification.");
  };
}
