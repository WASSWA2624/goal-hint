import type { ComponentType } from "react";
import { CardIcon, ChartIcon, GiftIcon, GridIcon, LayersIcon, ListIcon, SlidersIcon, TicketIcon, UserIcon, type IconProps } from "@/components/ui/icons";
import type { AdminSection } from "@/domain/admin-navigation";

export const adminSectionIcons: Record<AdminSection, ComponentType<IconProps>> = {
  overview: GridIcon, payments: CardIcon, codes: TicketIcon, subscribers: UserIcon, referrals: GiftIcon,
  plans: LayersIcon, settings: SlidersIcon, audit: ListIcon, analytics: ChartIcon,
};
