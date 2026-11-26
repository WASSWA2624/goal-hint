import type { ComponentType } from "react";
import { CardIcon, ChartIcon, GiftIcon, GridIcon, KeyIcon, LayersIcon, ListIcon, SlidersIcon, TicketIcon, UserIcon, type IconProps } from "@/components/ui/icons";
import type { AdminSection } from "@/domain/admin-navigation";

export const adminSectionIcons: Record<AdminSection, ComponentType<IconProps>> = {
  overview: GridIcon, payments: CardIcon, codes: TicketIcon, subscribers: UserIcon, referrals: GiftIcon,
  "password-requests": KeyIcon, plans: LayersIcon, settings: SlidersIcon, audit: ListIcon, analytics: ChartIcon,
};
