import { formatPeriodEnd } from "./subscription-period.ts";
import { maskPhone, smsHref, waHref } from "./phone.ts";

export type CodeDelivery = Readonly<{ code: string; reference: string; phone: string; message: string; whatsapp: string; sms: string }>;
type MessageCode = Readonly<{ code: string; reference: string; phone: string; planName: string; endsAt: Date; renewal: boolean; source: string }>;
export function codeDelivery(ready: MessageCode, origin: string): CodeDelivery {
  const end = formatPeriodEnd(ready.endsAt);
  const link = `${new URL(origin).origin}/en/account#code=${ready.code}`;
  const number = `Works only on your Goal Hint number ${maskPhone(ready.phone)}.`;
  const message = ready.source === "trial"
    ? `Goal Hint free trial code: ${ready.code}\nTap to unlock: ${link}\nFree trial: access until ${end}. ${number}`
    : ready.renewal ? `Goal Hint: renewed until ${end}. Your unlocked phone updates by itself.\nNew phone or browser? Code ${ready.code}, or tap: ${link}\n${number}`
    : `Goal Hint code: ${ready.code}\nTap to unlock: ${link}\n${ready.planName}: access until ${end}. ${number} Keep this message for a new phone.`;
  return { code: ready.code, reference: ready.reference, phone: ready.phone, message, whatsapp: waHref(ready.phone, message), sms: smsHref(ready.phone, message) };
}
export type PaymentCheck = Readonly<{ tone: "good" | "warning" | "info"; text: string }>;
export function paymentChecks(input: { amount: number; price: number; approved: string | null; pending: string | null; image: string | null; payerAccount: boolean; payerDiffers: boolean }): PaymentCheck[] {
  return [
    { tone: input.amount >= input.price ? "good" : "warning", text: input.amount >= input.price ? "Amount covers the plan price" : `UGX ${input.amount.toLocaleString("en-UG")} is below the price` },
    { tone: input.approved ? "warning" : "good", text: input.approved ? `Already approved in ${input.approved}` : "ID never approved on either network" },
    { tone: input.pending ? "warning" : "good", text: input.pending ? `Also in ${input.pending} (another account)` : "No other account has this ID pending" },
    { tone: input.image ? "warning" : "good", text: input.image ? `Same file as ${input.image}` : "No identical image" },
    { tone: input.payerAccount ? "warning" : "info", text: input.payerAccount ? "Payer has its own Goal Hint account" : "No other payer account found" },
    { tone: input.payerDiffers && (input.image || input.payerAccount) ? "warning" : "info", text: input.payerDiffers ? "Payer differs from the account number; verify the sender before approving" : "Payer matches the account number" },
  ];
}
