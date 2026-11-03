import type { ReactNode } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isSupportedLocale } from "@/i18n/locales";
import { connection } from "next/server";
import { headers } from "next/headers";
import { getDiscoveryPolicy } from "@/server/seo/policy";
import { OnlineRuntime } from "@/app/_components/online-runtime";
import { AppDownloadsProvider } from "@/components/downloads/app-downloads-provider";
import { getAppDownloads } from "@/server/downloads/catalog";

/** Resolve deployment controls per request, independently of the build environment. */
export async function generateMetadata(): Promise<Metadata> {
  await connection();
  return { robots: { index: getDiscoveryPolicy().index, follow: true } };
}

export default async function LocaleLayout({ children, params }: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  await connection();
  const [downloads, requestHeaders] = await Promise.all([getAppDownloads(), headers()]);
  return <AppDownloadsProvider initial={downloads} initialAgent={requestHeaders.get("user-agent") ?? ""} locale={locale}>{children}<OnlineRuntime /></AppDownloadsProvider>;
}
