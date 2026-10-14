import type { AnalyticsChannel, Attribution } from "./analytics.ts";

/**
 * Pure classification for the analytics collector. Raw user agents, referrer URLs and
 * search text never leave these functions; only the reduced categories are stored.
 */

const botPattern = new RegExp([
  "bot\\b", "bot/", "-bot", "_bot", "crawl", "spider", "slurp", "scrap", "headless", "phantomjs", "selenium", "webdriver",
  "puppeteer", "playwright", "lighthouse", "pagespeed", "gtmetrix", "pingdom", "uptime", "statuscake", "site24x7", "monitor",
  "preview", "facebookexternalhit", "facebookcatalog", "meta-externalagent", "embedly", "quora link", "vkshare", "w3c_validator",
  "validator", "whatsapp", "telegram", "discord", "slack", "skypeuripreview", "linkedin", "pinterest", "redditbot", "twitter",
  "bingpreview", "google-inspectiontool", "google-read-aloud", "googleother", "mediapartners", "adsbot", "apis-google",
  "feedfetcher", "applebot", "yandex", "baiduspider", "bytespider", "petalbot", "ahrefs", "semrush", "mj12", "dotbot",
  "dataforseo", "gptbot", "chatgpt-user", "oai-searchbot", "claudebot", "claude-web", "anthropic-ai", "ccbot", "perplexity",
  "amazonbot", "cohere-ai", "diffbot", "python-requests", "python-urllib", "aiohttp", "httpx", "curl/", "wget", "go-http-client",
  "java/", "okhttp", "node-fetch", "undici", "axios", "libwww", "httpclient", "postman", "insomnia", "scrapy", "nutch",
].join("|"), "i");

export function isBotUserAgent(userAgent: string | null): boolean {
  if (userAgent === null) return true;
  const value = userAgent.trim();
  return value.length < 12 || botPattern.test(value);
}

export type ClientSummary = Readonly<{
  deviceType: "desktop" | "mobile" | "tablet";
  browser: string;
  browserVersion: string | null;
  os: string;
  osVersion: string | null;
}>;

const browsers: readonly (readonly [string, RegExp])[] = [
  ["Facebook app", /\b(?:FBAN|FBAV|FB_IAB)\/?([\d.]+)?/],
  ["Instagram app", /\bInstagram ([\d.]+)/],
  ["Edge", /\b(?:Edg|EdgA|EdgiOS)\/([\d.]+)/],
  ["Opera Mini", /\bOpera Mini\/([\d.]+)/],
  ["Opera", /\b(?:OPR|OPX|OPiOS|OPT)\/([\d.]+)/],
  ["Samsung Internet", /\bSamsungBrowser\/([\d.]+)/],
  ["UC Browser", /\bUC ?Browser\/([\d.]+)/],
  ["Yandex Browser", /\bYaBrowser\/([\d.]+)/],
  ["Vivaldi", /\bVivaldi\/([\d.]+)/],
  ["Huawei Browser", /\bHuaweiBrowser\/([\d.]+)/],
  ["Mi Browser", /\b(?:MiuiBrowser|XiaoMi\/MiuiBrowser)\/([\d.]+)/],
  ["Firefox", /\b(?:Firefox|FxiOS)\/([\d.]+)/],
  ["Chrome", /\b(?:CriOS|Chrome)\/([\d.]+)/],
  ["Safari", /\bVersion\/([\d.]+).*Safari\//],
  ["Internet Explorer", /\b(?:MSIE |Trident\/.*rv:)([\d.]+)/],
];

const major = (value: string | undefined) => value?.split(".")[0]?.slice(0, 16) || null;

export function summarizeClient(userAgent: string, hints: Readonly<{ mobileHint?: boolean | null; touchPoints?: number | null;
  screenWidth?: number | null }> = {}): ClientSummary {
  let browser = "Other";
  let browserVersion: string | null = null;
  for (const [name, pattern] of browsers) {
    const match = pattern.exec(userAgent);
    if (match) { browser = name; browserVersion = major(match[1]); break; }
  }
  if (browser === "Safari" && !/Macintosh|iPhone|iPad|iPod/.test(userAgent)) browser = "Android WebView";
  if (browser === "Chrome" && /; wv\)/.test(userAgent)) browser = "Android WebView";

  let os = "Other";
  let osVersion: string | null = null;
  let match: RegExpExecArray | null;
  const touchMac = /Macintosh/.test(userAgent) && (hints.touchPoints ?? 0) > 1;
  if (/KAIOS/i.test(userAgent)) { os = "KaiOS"; osVersion = major(/KAIOS\/([\d.]+)/i.exec(userAgent)?.[1]); }
  else if (/HarmonyOS/.test(userAgent)) os = "HarmonyOS";
  else if ((match = /Android ([\d.]+)/.exec(userAgent))) { os = "Android"; osVersion = major(match[1]); }
  else if (/Android/.test(userAgent)) os = "Android";
  else if ((match = /(?:iPhone|iPod).*?OS (\d+)/.exec(userAgent))) { os = "iOS"; osVersion = match[1] ?? null; }
  else if ((match = /iPad.*?OS (\d+)/.exec(userAgent))) { os = "iPadOS"; osVersion = match[1] ?? null; }
  else if (touchMac) os = "iPadOS";
  else if (/CrOS/.test(userAgent)) os = "ChromeOS";
  else if ((match = /Windows NT ([\d.]+)/.exec(userAgent))) {
    os = "Windows";
    osVersion = ({ "10.0": "10+", "6.3": "8.1", "6.2": "8", "6.1": "7" } as Record<string, string>)[match[1] ?? ""] ?? null;
  }
  else if ((match = /Mac OS X (\d+)[._](\d+)/.exec(userAgent))) { os = "macOS"; osVersion = match[1] === "10" ? `10.${match[2]}` : match[1] ?? null; }
  else if (/Linux/.test(userAgent)) os = "Linux";

  let deviceType: ClientSummary["deviceType"] = "desktop";
  if (/iPad|Tablet|Kindle|Silk|PlayBook|Nexus (?:7|9|10)/i.test(userAgent) || touchMac || (os === "Android" && !/Mobile/.test(userAgent))) {
    deviceType = "tablet";
  } else if (hints.mobileHint === true || /Mobi|iPhone|iPod|Opera Mini|KAIOS|IEMobile|Windows Phone/i.test(userAgent)) {
    deviceType = "mobile";
  }
  // Desktop-mode phone browsers still report their narrow CSS viewport.
  if (deviceType === "desktop" && (hints.touchPoints ?? 0) > 0 && (hints.screenWidth ?? Infinity) < 600) deviceType = "mobile";
  return { deviceType, browser, browserVersion, os, osVersion };
}

export function screenBucket(width: number | undefined): string | null {
  if (width === undefined || width <= 0) return null;
  if (width < 360) return "under 360";
  if (width < 414) return "360-413";
  if (width < 768) return "414-767";
  if (width < 1024) return "768-1023";
  if (width < 1440) return "1024-1439";
  if (width < 1920) return "1440-1919";
  return "1920+";
}

export function normalizeLanguage(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const [canonical] = Intl.getCanonicalLocales(value);
    if (!canonical) return null;
    const locale = new Intl.Locale(canonical);
    return (locale.region ? `${locale.language}-${locale.region}` : locale.language).slice(0, 16);
  } catch { return null; }
}

const searchEngines: readonly (readonly [RegExp, string])[] = [
  [/(^|\.)google\.[a-z.]+$|^com\.google\.android\.googlequicksearchbox$/, "google"],
  [/(^|\.)bing\.com$/, "bing"], [/(^|\.)duckduckgo\.com$/, "duckduckgo"], [/(^|\.)yahoo\.[a-z.]+$/, "yahoo"],
  [/(^|\.)yandex\.[a-z.]+$|(^|\.)ya\.ru$/, "yandex"], [/(^|\.)baidu\.com$/, "baidu"], [/(^|\.)ecosia\.org$/, "ecosia"],
  [/^search\.brave\.com$/, "brave"], [/(^|\.)startpage\.com$/, "startpage"], [/(^|\.)qwant\.com$/, "qwant"],
  [/(^|\.)naver\.com$/, "naver"], [/(^|\.)seznam\.cz$/, "seznam"], [/(^|\.)sogou\.com$/, "sogou"], [/(^|\.)ask\.com$/, "ask"],
  [/(^|\.)aol\.com$/, "aol"], [/(^|\.)petalsearch\.com$/, "petal"], [/(^|\.)so\.com$/, "360"],
];
const socialNetworks: readonly (readonly [RegExp, string])[] = [
  [/(^|\.)facebook\.com$|^fb\.me$/, "facebook"], [/(^|\.)instagram\.com$/, "instagram"], [/^t\.co$|(^|\.)twitter\.com$|(^|\.)x\.com$/, "x"],
  [/(^|\.)linkedin\.com$|^lnkd\.in$/, "linkedin"], [/(^|\.)reddit\.com$/, "reddit"], [/(^|\.)youtube\.com$|^youtu\.be$/, "youtube"],
  [/(^|\.)tiktok\.com$/, "tiktok"], [/(^|\.)pinterest\.[a-z.]+$|^pin\.it$/, "pinterest"],
  [/(^|\.)whatsapp\.com$|^wa\.me$|^com\.whatsapp$/, "whatsapp"], [/(^|\.)telegram\.org$|^t\.me$|^org\.telegram\.messenger$/, "telegram"],
  [/(^|\.)snapchat\.com$/, "snapchat"], [/(^|\.)threads\.net$/, "threads"], [/(^|\.)quora\.com$/, "quora"],
  [/(^|\.)discord(app)?\.com$/, "discord"], [/(^|\.)vk\.com$/, "vk"], [/(^|\.)bsky\.app$/, "bluesky"], [/(^|\.)messenger\.com$/, "messenger"],
];
const aiAssistants = /(^|\.)(chatgpt\.com|chat\.openai\.com|perplexity\.ai|claude\.ai|gemini\.google\.com|copilot\.microsoft\.com|chat\.deepseek\.com|meta\.ai|grok\.com)$/;
const webmail = /^(mail\.google\.com|com\.google\.android\.gm|outlook\.live\.com|outlook\.office\.com|outlook\.office365\.com|mail\.yahoo\.com|mail\.aol\.com|mail\.proton\.me)$/;

/** Accepts the browser's referrer URL (or an android-app:// referrer) and returns its bare host. */
export function referrerHost(referrer: string | undefined, ownHost: string): string | null {
  if (!referrer) return null;
  try {
    const url = new URL(referrer);
    const host = (url.protocol === "android-app:" ? url.hostname || url.pathname.replace(/^\/+/, "").split("/")[0] : url.hostname)
      ?.toLowerCase().replace(/^www\./, "").replace(/^m\./, "") ?? "";
    if (!/^[a-z0-9.-]{1,255}$/.test(host) || host === ownHost.toLowerCase().replace(/^www\./, "")) return null;
    return host;
  } catch { return null; }
}

function lookup(table: readonly (readonly [RegExp, string])[], host: string): string | null {
  return table.find(([pattern]) => pattern.test(host))?.[1] ?? null;
}

const lower = (value: string | undefined) => value?.trim().toLowerCase() || undefined;

/** Campaign tags win over click identifiers, which win over the referring site. */
export function classifyChannel(host: string | null, attribution: Attribution | undefined): AnalyticsChannel {
  const medium = lower(attribution?.medium), source = lower(attribution?.source);
  const sourceIsSocial = source !== undefined && (lookup(socialNetworks, source.replace(/^www\./, "")) !== null
    || /^(facebook|fb|instagram|ig|twitter|x|linkedin|tiktok|youtube|whatsapp|telegram|snapchat|pinterest|reddit)$/.test(source));
  if (medium !== undefined) {
    if (/^(cpc|ppc|paid|paidsearch|paid-search|sem|cpm|display|banner)$/.test(medium)) return sourceIsSocial ? "paid-social" : "paid-search";
    if (/^(paid-?social|social-?paid|paidsocial)$/.test(medium)) return "paid-social";
    if (/^(e-?mail|newsletter)$/.test(medium)) return "email";
    if (/^(social|social-network|social-media|sm|social_media)$/.test(medium)) return "social";
    if (medium === "organic") return "organic-search";
    if (medium === "referral") return "referral";
  }
  if (attribution?.click === "google" || attribution?.click === "microsoft") return "paid-search";
  if (attribution?.click === "meta") return "social";
  if (source !== undefined || medium !== undefined || attribution?.campaign) return sourceIsSocial ? "social" : "campaign";
  if (host === null) return "direct";
  if (aiAssistants.test(host)) return "ai-assistant";
  if (webmail.test(host)) return "email";
  if (lookup(searchEngines, host)) return "organic-search";
  if (lookup(socialNetworks, host)) return "social";
  return "referral";
}

const emailPattern = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
const longNumber = /\+?\d[\d\s().-]{6,}\d/g;

/** Lower-case, collapse whitespace and redact anything that looks like an email address or phone/ID number. */
export function normalizeFreeText(value: string, maximum: number): string {
  return value.normalize("NFKC").replace(emailPattern, "[email]").replace(longNumber, "[number]")
    .replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maximum);
}

export function normalizeSearchTerm(value: string): string | null {
  const term = normalizeFreeText(value, 100).toLowerCase();
  return term.length > 0 ? term : null;
}

/** Outbound and download targets keep origin and path; query strings and fragments may carry identifiers. */
export function sanitizeTarget(href: string, base: string): Readonly<{ host: string; target: string; file: string }> | null {
  try {
    const url = new URL(href, base);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const pathname = url.pathname.slice(0, 400);
    return { host: url.hostname.toLowerCase().replace(/^www\./, ""), target: `${url.origin}${pathname}`.slice(0, 512),
      file: decodeURIComponent(pathname.split("/").filter(Boolean).pop() ?? url.hostname).slice(0, 160) };
  } catch { return null; }
}
