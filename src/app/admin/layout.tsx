import type { Metadata } from "next";
import type { ReactNode } from "react";

// Every /admin page is private: never indexed or followed (next.config.ts and the proxy add the same as headers).
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return children;
}
