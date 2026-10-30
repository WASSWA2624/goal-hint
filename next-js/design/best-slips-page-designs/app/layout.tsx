import type { ReactNode } from "react";
import localFont from "next/font/local";
import { AppProviders } from "@/app/_components/app-providers";
import { TruncationTooltips } from "@/components/ui/truncation-tooltips";

const manrope = localFont({ src: "../../../assets/brand/source/fonts/Manrope-wght-latin.woff2",
  variable: "--font-manrope", weight: "200 800", display: "swap", fallback: ["Arial", "sans-serif"] });

export const metadata = { title: "Best Slips · Desktop design review", robots: { index: false, follow: false } };

/** Keep product providers and typography; omit analytics and offline registration in this local review. */
export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="en" className={manrope.variable}><body><TruncationTooltips /><AppProviders>{children}</AppProviders></body></html>;
}
