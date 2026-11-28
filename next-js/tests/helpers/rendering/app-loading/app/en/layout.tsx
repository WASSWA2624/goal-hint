import type { ReactNode } from "react";
import AppNavigationLayout from "@/app/[locale]/(app-navigation)/layout";

export default function Layout({ children }: { children: ReactNode }) {
  return <AppNavigationLayout params={Promise.resolve({ locale: "en" })}>{children}</AppNavigationLayout>;
}
