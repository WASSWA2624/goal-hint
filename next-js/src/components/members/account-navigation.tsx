import { BellIcon, CardIcon, ClockIcon, GiftIcon, GridIcon, LockIcon, MonitorIcon, PhoneIcon, ShieldIcon } from "@/components/ui/icons";
import type { AccountSection } from "@/domain/account-navigation";

export const accountSectionIcons = {
  overview: GridIcon, subscription: ShieldIcon, payments: CardIcon, phone: PhoneIcon,
  referrals: GiftIcon,
  password: LockIcon, devices: MonitorIcon, notifications: BellIcon, activity: ClockIcon,
} satisfies Record<AccountSection, typeof GridIcon>;
