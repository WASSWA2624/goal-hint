import { z } from "zod";

export const communityDestinations = [
  { type: "whatsapp-group", label: "WhatsApp Group", description: "Join the conversation", action: "Join", placeholder: "https://chat.whatsapp.com/…" },
  { type: "whatsapp-channel", label: "WhatsApp Channel", description: "Follow our updates", action: "Follow", placeholder: "https://www.whatsapp.com/channel/…" },
  { type: "telegram-channel", label: "Telegram", description: "Join us on Telegram", action: "Join", placeholder: "https://t.me/…" },
  { type: "tiktok", label: "TikTok", description: "Follow our videos", action: "Follow", placeholder: "https://www.tiktok.com/@…" },
  { type: "x", label: "X", description: "Follow our posts", action: "Follow", placeholder: "https://x.com/…" },
  { type: "instagram", label: "Instagram", description: "Follow our updates", action: "Follow", placeholder: "https://www.instagram.com/…" },
] as const;
export type CommunityType = (typeof communityDestinations)[number]["type"];
export type CommunityLink = Readonly<{ type: CommunityType; url: string; enabled: boolean }>;

export const defaultCommunityLinks: readonly CommunityLink[] = Object.freeze(communityDestinations.map(({ type }) =>
  Object.freeze({ type, url: "", enabled: true })));

/** Newly added destinations remain available; an owner's explicit visibility choices always win. */
export function communityLinksWithDefaults(links: readonly CommunityLink[]): readonly CommunityLink[] {
  const saved = new Map(links.map(link => [link.type, link]));
  return defaultCommunityLinks.map(link => saved.get(link.type) ?? link);
}

const shareParameters: Readonly<Record<CommunityType, readonly string[]>> = {
  "whatsapp-group": ["mode"], "whatsapp-channel": ["mode"], "telegram-channel": [],
  tiktok: ["_t", "_r", "is_from_webapp", "sender_device", "web_id", "lang"],
  x: ["s", "t"], instagram: ["igsh", "igshid", "ig_rid"],
};
const reservedProfiles = new Set(["home", "explore", "search", "share", "intent", "login", "logout", "signup", "accounts", "settings",
  "privacy", "terms", "about", "help", "i", "p", "reel", "reels", "stories", "direct", "developer", "developers"]);

/** Official HTTPS invitation/profile paths, including harmless parameters added by platform share buttons. */
export function validCommunityUrl(type: CommunityType, value: string): boolean {
  if (value.length > 512 || /[\s\\\u0000-\u001f\u007f]/u.test(value)) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash) return false;
    for (const [key, parameter] of url.searchParams) {
      if ((!shareParameters[type].includes(key) && !/^utm_(?:source|medium|campaign|term|content)$/u.test(key)) ||
          parameter.length > 256 || !/^[A-Za-z0-9_.~+ =-]*$/u.test(parameter)) return false;
    }
    if (type === "whatsapp-channel") return ["whatsapp.com", "www.whatsapp.com"].includes(url.hostname) && /^\/channel\/[A-Za-z0-9_-]+\/?$/u.test(url.pathname);
    if (type === "whatsapp-group") return url.hostname === "chat.whatsapp.com" && /^\/[A-Za-z0-9_-]+\/?$/u.test(url.pathname);
    if (type === "telegram-channel") return url.hostname === "t.me" &&
      /^\/(?:[A-Za-z][A-Za-z0-9_]{3,31}|\+[A-Za-z0-9_-]+|joinchat\/[A-Za-z0-9_-]+)\/?$/u.test(url.pathname) &&
      !["share", "proxy", "socks", "login", "setlanguage", "addstickers", "addtheme", "contact"].includes(url.pathname.replace(/^\/|\/$/gu, "").toLowerCase());
    if (type === "tiktok") return ["tiktok.com", "www.tiktok.com"].includes(url.hostname)
      ? /^\/@[A-Za-z0-9_.]{2,24}\/?$/u.test(url.pathname)
      : ["vm.tiktok.com", "vt.tiktok.com"].includes(url.hostname) && /^\/[A-Za-z0-9]+\/?$/u.test(url.pathname);
    const profile = url.pathname.replace(/^\/|\/$/gu, "");
    if (reservedProfiles.has(profile.toLowerCase())) return false;
    if (type === "x") return ["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(url.hostname) && /^[A-Za-z0-9_]{1,15}$/u.test(profile);
    return ["instagram.com", "www.instagram.com"].includes(url.hostname) && /^[A-Za-z0-9_.]{1,30}$/u.test(profile);
  } catch { return false; }
}

export const communityLinksSchema = z.array(z.object({
  type: z.enum(["whatsapp-channel", "telegram-channel", "whatsapp-group", "tiktok", "x", "instagram"]), url: z.string().trim().max(512), enabled: z.boolean(),
}).strict().refine(link => link.url === "" || validCommunityUrl(link.type, link.url), "Enter a valid HTTPS link for this platform."))
  .max(communityDestinations.length).refine(links => new Set(links.map(link => link.type)).size === links.length, "Each destination can appear once.");

/** Missing configuration keeps channels visible as coming soon. Invalid saved configuration never becomes public. */
export function publicCommunityLinks(value: unknown): readonly CommunityLink[] {
  const parsed = communityLinksSchema.safeParse(value ?? []);
  return parsed.success ? communityLinksWithDefaults(parsed.data).filter(link => link.enabled) : [];
}
