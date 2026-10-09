import type { ReactNode } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isSupportedLocale } from "@/i18n/locales";

/** Every current public page is interim. Prompt 042 owns launch indexing. */
export const metadata: Metadata = { robots: { index: false, follow: true } };

export default async function LocaleLayout({ children, params }: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  return children;
}
