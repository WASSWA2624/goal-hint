import type { ReactNode } from "react";
import { getShellInstant } from "@/app/_components/shell-time";
import { PersistentAppShell } from "@/components/navigation/public-shell-chrome";

export default async function AppNavigationLayout({ children, params }: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const [{ locale }, asOf] = await Promise.all([params, getShellInstant()]);
  return <PersistentAppShell locale={locale} asOf={asOf}>{children}</PersistentAppShell>;
}
