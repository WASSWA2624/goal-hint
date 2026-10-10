import type { ReactNode } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isSupportedLocale } from "@/i18n/locales";
import { connection } from "next/server";
import { getDiscoveryPolicy } from "@/server/seo/policy";

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
  return children;
}
