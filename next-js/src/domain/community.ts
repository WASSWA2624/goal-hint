import { z } from "zod";

export const communityDestinations = [
  { type: "whatsapp-channel", label: "WhatsApp Channel", description: "Results, tutorials and updates" },
  { type: "telegram-channel", label: "Telegram Channel", description: "Results, tutorials and updates" },
  { type: "whatsapp-group", label: "WhatsApp Group", description: "Discussion and questions" },
] as const;
export type CommunityType = (typeof communityDestinations)[number]["type"];
export type CommunityLink = Readonly<{ type: CommunityType; url: string; enabled: boolean }>;

/** Exact platform hosts and public invitation paths; no credentials, redirects or unsafe schemes. */
export function validCommunityUrl(type: CommunityType, value: string): boolean {
  if (value.length > 512 || /[\s\\\u0000-\u001f\u007f]/u.test(value)) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash || url.search) return false;
    if (type === "whatsapp-channel") return ["whatsapp.com", "www.whatsapp.com"].includes(url.hostname) && /^\/channel\/[A-Za-z0-9_-]+\/?$/u.test(url.pathname);
    if (type === "whatsapp-group") return url.hostname === "chat.whatsapp.com" && /^\/[A-Za-z0-9_-]+\/?$/u.test(url.pathname);
    return url.hostname === "t.me" && /^\/(?:[A-Za-z][A-Za-z0-9_]{3,31}|\+[A-Za-z0-9_-]+)\/?$/u.test(url.pathname);
  } catch { return false; }
}

export const communityLinksSchema = z.array(z.object({
  type: z.enum(["whatsapp-channel", "telegram-channel", "whatsapp-group"]), url: z.string().trim().max(512), enabled: z.boolean(),
}).strict().refine(link => link.url === "" ? !link.enabled : validCommunityUrl(link.type, link.url), "Enter a valid HTTPS community link for this platform."))
  .max(3).refine(links => new Set(links.map(link => link.type)).size === links.length, "Each destination can appear once.");
export function publicCommunityLinks(value: unknown): readonly CommunityLink[] {
  const parsed = communityLinksSchema.safeParse(value);
  return parsed.success ? parsed.data.filter(link => link.enabled && link.url) : [];
}
