import type { Metadata } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";
import { publicPolicy } from "@/domain/public-policy";
import { StyleProvider } from "@/styles/provider";
import { createMessages } from "@/i18n/messages";
import { canonicalUrl } from "@/domain/discovery";

const manrope = localFont({
  src: "../../assets/brand/source/fonts/Manrope-wght.ttf",
  variable: "--font-manrope",
  weight: "200 800",
  display: "swap",
  fallback: ["Arial", "sans-serif"],
});

const messages = createMessages(publicPolicy.defaultLocale);

export const metadata: Metadata = {
  metadataBase: new URL(publicPolicy.origin),
  title: messages.text("metadata.homeTitle"),
  description: messages.text("metadata.description"),
  openGraph: { type: "website", siteName: publicPolicy.name, locale: "en", title: messages.text("metadata.homeTitle"),
    description: messages.text("metadata.description"), images: [{ url: canonicalUrl("/brand/goal-hint-open-graph.png"),
      width: 1200, height: 630, alt: messages.text("metadata.socialAlt") }] },
  twitter: { card: "summary_large_image", images: [canonicalUrl("/brand/goal-hint-open-graph.png")] },
  icons: {
    icon: [
      { url: "/brand/goal-hint-favicon.svg", type: "image/svg+xml" },
      { url: "/brand/goal-hint-favicon.ico", sizes: "16x16 32x32 48x48" },
    ],
    apple: "/brand/goal-hint-apple-touch-icon.png",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={publicPolicy.defaultLocale} className={manrope.variable}>
      <body><StyleProvider>{children}</StyleProvider></body>
    </html>
  );
}
