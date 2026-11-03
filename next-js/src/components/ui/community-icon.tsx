import type { CommunityType } from "@/domain/community";
import { GroupIcon, TelegramIcon, WhatsAppIcon, type IconProps } from "./icons";

const icons = { "whatsapp-channel": WhatsAppIcon, "telegram-channel": TelegramIcon, "whatsapp-group": GroupIcon };
export function CommunityIcon({ type, ...props }: IconProps & { type: CommunityType }) {
  const Icon = icons[type];
  return <Icon {...props} />;
}
