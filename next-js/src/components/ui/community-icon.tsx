import type { CommunityType } from "@/domain/community";
import type { IconProps } from "./icons";
import { communityBrandPaths } from "./community-brand-paths";

const brands = { "whatsapp-channel": "whatsapp", "whatsapp-group": "whatsapp", "telegram-channel": "telegram", tiktok: "tiktok", x: "x", instagram: "instagram" } as const;
export function CommunityIcon({ type, ...props }: IconProps & { type: CommunityType }) {
  return <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true" focusable="false" {...props}>
    <path d={communityBrandPaths[brands[type]]} />
  </svg>;
}
