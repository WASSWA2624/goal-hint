import type { Metadata } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";
import { StyledComponentsRegistry } from "@/styles/registry";
import { TruncationTooltips } from "@/components/ui/truncation-tooltips";

const manrope = localFont({ src: "../../assets/brand/source/fonts/Manrope-wght-latin.woff2",
  variable: "--font-manrope", weight: "200 800", display: "swap", fallback: ["Arial", "sans-serif"] });

export const metadata: Metadata = { title: "Desktop Theme Studio · Goal Hint",
  description: "Ten desktop directions for the existing Goal Hint interface.", robots: { index: false, follow: false },
  icons: { icon: "/brand/goal-hint-favicon.svg" } };

export default function ReviewLayout({ children }: { children: ReactNode }) {
  return <html lang="en" className={manrope.variable}><body><StyledComponentsRegistry>
    {children}<TruncationTooltips />
  </StyledComponentsRegistry></body></html>;
}
