import type { Metadata } from "next";
import { type ReactNode } from "react";
import localFont from "next/font/local";
import { publicPolicy } from "@/domain/public-policy";
import { AppProviders } from "@/app/_components/app-providers";
import { ConsentBootstrapScript } from "@/app/_components/consent-bootstrap-script";
import { createMessages } from "@/i18n/messages";
import { canonicalUrl } from "@/domain/discovery";
import { TruncationTooltips } from "@/components/ui/truncation-tooltips";
import { OfflineBootstrap } from "@/components/offline/offline-bootstrap";
import { consentBootstrapScript, consentInitialStyle } from "@/server/analytics/consent-bootstrap";
import { socialLocale } from "@/server/seo/metadata";

// Latin WOFF2 subset of the variable source TTF (see docs/brand-styling.md); other scripts use the fallback.
const manrope = localFont({
  src: "../../assets/brand/source/fonts/Manrope-wght-latin.woff2",
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
  openGraph: { type: "website", siteName: publicPolicy.name, locale: socialLocale, title: messages.text("metadata.homeTitle"),
    description: messages.text("metadata.description"), images: [{ url: canonicalUrl("/brand/goal-hint-open-graph.png"),
      width: 1200, height: 630, alt: messages.text("metadata.socialAlt") }] },
  twitter: { card: "summary_large_image", images: [{ url: canonicalUrl("/brand/goal-hint-open-graph.png"), alt: messages.text("metadata.socialAlt") }] },
  icons: {
    icon: [
      { url: "/brand/goal-hint-favicon.svg?v=20261017", type: "image/svg+xml" },
      { url: "/brand/goal-hint-favicon.ico?v=20261017", sizes: "16x16 32x32 48x48" },
    ],
    apple: "/brand/goal-hint-apple-touch-icon.png",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={publicPolicy.defaultLocale} className={manrope.variable}>
      <head>
        <style id="analytics-consent-initial">{consentInitialStyle}</style>
        <ConsentBootstrapScript id="analytics-consent-bootstrap" code={consentBootstrapScript()} />
      </head>
      <body>
        <TruncationTooltips />
        <AppProviders>
          {children}
          <OfflineBootstrap />
        </AppProviders>
      </body>
    </html>
  );
}
