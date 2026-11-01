"use client";
import { ButtonLink } from "@/components/ui/controls";
import { GiftIcon } from "@/components/ui/icons";
import { accountSectionHref } from "@/domain/account-navigation";

/** The same redemption choice and existing invitation route on Package and Pay. */
export function CheckoutReferralChoice({ locale, availableDays, checked, disabled, onChange }: {
  locale: string; availableDays: number; checked: boolean; disabled: boolean; onChange: (selected: boolean) => void;
}) {
  if (availableDays === 0) return <ButtonLink variant="secondary" href={accountSectionHref(locale, "referrals", `/${locale}/subscribe`)} prefetch={false}>
    <GiftIcon /><span data-method-text>Refer a friend to earn days</span>
  </ButtonLink>;
  return <label><input type="checkbox" name="checkout-referral" checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} />
    <GiftIcon /><span data-method-text>Redeem referral days<small>{availableDays} days available</small></span>
  </label>;
}
