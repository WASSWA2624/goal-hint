import type { Metadata } from "next";
import { PublicShell } from "@/app/_components/public-shell";
import { PasswordResetLinkForm } from "@/components/members/password-reset-link-form";
import { createMessages } from "@/i18n/messages";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: createMessages().text("account.resetPassword"),
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default async function ResetPasswordPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <PublicShell locale={locale}><PasswordResetLinkForm locale={locale} /></PublicShell>;
}
