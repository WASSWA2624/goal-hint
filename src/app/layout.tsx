import type { Metadata } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";
import { publicPolicy } from "@/domain/public-policy";
import { StyleProvider } from "@/styles/provider";

const manrope = localFont({
  src: "../../assets/brand/source/fonts/Manrope-wght.ttf",
  variable: "--font-manrope",
  weight: "200 800",
  display: "swap",
  fallback: ["Arial", "sans-serif"],
});

export const metadata: Metadata = {
  title: publicPolicy.name,
  description: "Goal Hint is in development. Predictions are not yet available.",
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
