"use client";

import { useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { resolveLocale } from "@/i18n/locales";
import { DesktopSubscriptionBanner } from "./desktop-subscription-banner";
import { MobileSubscriptionBanner } from "./mobile-subscription-banner";
import { getMemberSessionSnapshot, getServerMemberSessionSnapshot, getServerSubscriptionSnapshot, getSubscriptionSnapshot, subscribeMemberSession } from "./member-session";

const minute = 60_000;
const subscribeMinute = (notify: () => void) => { const timer = setInterval(notify, minute); return () => clearInterval(timer); };
const currentMinute = () => Math.floor(Date.now() / minute) * minute;
const serverMinute = () => 0;

/** Both responsive invitations share one confirmed private session and its approval/expiry refreshes. */
export function SubscriptionStatusBar({ locale = "en", className, desktopOnly = false, wide = false, bestSlips = false }: {
  locale?: string; className?: string; desktopOnly?: boolean; wide?: boolean; bestSlips?: boolean;
}) {
  const subscription = useSyncExternalStore(subscribeMemberSession, getSubscriptionSnapshot, getServerSubscriptionSnapshot);
  const phone = useSyncExternalStore(subscribeMemberSession, getMemberSessionSnapshot, getServerMemberSessionSnapshot);
  const now = useSyncExternalStore(subscribeMinute, currentMinute, serverMinute);
  const pathname = usePathname();
  if (!subscription || pathname === `/${resolveLocale(locale)}/account`) return null;
  const props = { locale, pathname, signedIn: phone !== null, subscription, now, wide, ...(className ? { className } : {}) };
  return <>
    <DesktopSubscriptionBanner {...props} bestSlips={bestSlips} />
    {!desktopOnly && <MobileSubscriptionBanner {...props} bestSlips={bestSlips} />}
  </>;
}
