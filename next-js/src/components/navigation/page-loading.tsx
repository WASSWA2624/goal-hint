"use client";

import { HeaderBrand } from "@/components/ui/brand";
import { PageMain } from "@/components/ui/layout";
import { FallbackStyleProvider } from "@/styles/provider";
import { Header, HeaderContent, ShellFrame } from "./shell-styles";
import { NavigationProgress } from "./navigation-progress";

/** A request-independent shell that can be prefetched before any stored page reads. */
export function PageLoading({ label }: { label: string }) {
  return <FallbackStyleProvider><ShellFrame>
    <Header><HeaderContent $wide><HeaderBrand /></HeaderContent><NavigationProgress label={label} /></Header>
    <PageMain id="main-content" tabIndex={-1} $app $compact aria-busy="true" />
  </ShellFrame></FallbackStyleProvider>;
}
