import { createMessages } from "../i18n/messages.ts";
import { publicPolicy } from "./public-policy.ts";
import { referralPath, validReferralCode } from "./referrals.ts";
import { telegramShareUrl, whatsAppShareUrl } from "./share-links.ts";

export type ReferralInvitation = Readonly<{ title: string; text: string; url: string }>;

function invitationLinks(url: string, locale: string) {
  const invitation: ReferralInvitation = { title: publicPolicy.name,
    text: createMessages(locale).text("referrals.invitation", { name: publicPolicy.name }),
    url };
  return { invitation, whatsApp: whatsAppShareUrl(`${invitation.text}\n${invitation.url}`),
    telegram: telegramShareUrl(invitation.url, invitation.text) };
}

export type InvitationLinks = ReturnType<typeof invitationLinks>;

export function publicInvitation(locale: string): InvitationLinks {
  return invitationLinks(publicPolicy.origin, locale);
}

export function referralInvitation(code: string, locale: string): InvitationLinks {
  if (!validReferralCode(code)) throw new RangeError("An invitation requires a valid referral code.");
  return invitationLinks(new URL(referralPath(code), publicPolicy.origin).toString(), locale);
}
