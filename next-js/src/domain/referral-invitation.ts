import { createMessages } from "../i18n/messages.ts";
import { publicPolicy } from "./public-policy.ts";
import { referralPath, validReferralCode } from "./referrals.ts";
import { telegramShareUrl, whatsAppShareUrl } from "./share-links.ts";

export type ReferralInvitation = Readonly<{ title: string; text: string; url: string }>;

export function referralInvitation(code: string, locale: string) {
  if (!validReferralCode(code)) throw new RangeError("An invitation requires a valid referral code.");
  const invitation: ReferralInvitation = { title: publicPolicy.name,
    text: createMessages(locale).text("referrals.invitation", { name: publicPolicy.name }),
    url: new URL(referralPath(code), publicPolicy.origin).toString() };
  return { invitation, whatsApp: whatsAppShareUrl(`${invitation.text}\n${invitation.url}`),
    telegram: telegramShareUrl(invitation.url, invitation.text) };
}
