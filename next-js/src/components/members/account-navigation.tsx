import { BellIcon, CardIcon, ClockIcon, GiftIcon, GridIcon, LockIcon, MonitorIcon, PhoneIcon, ShieldIcon, WalletIcon } from "@/components/ui/icons";
import type { AccountSection } from "@/domain/account-navigation";

export const accountSectionIcons = {
  overview: GridIcon, subscription: ShieldIcon, wallet: WalletIcon, payments: CardIcon, phone: PhoneIcon,
  referrals: GiftIcon,
  password: LockIcon, devices: MonitorIcon, notifications: BellIcon, activity: ClockIcon,
} satisfies Record<AccountSection, typeof GridIcon>;
