import type { Metadata } from "next";
import type { ReactNode } from "react";
import { publicPolicy } from "@/domain/public-policy";

export const metadata: Metadata = {
  title: publicPolicy.name,
  description: "Goal Hint is in development. Predictions are not yet available.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={publicPolicy.defaultLocale}>
      <body>{children}</body>
    </html>
  );
}
