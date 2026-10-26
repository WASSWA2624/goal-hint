"use client";

import type { ReactNode } from "react";
import { BrandLogo } from "@/components/ui/brand";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Container, PageMain, Stack } from "@/components/ui/layout";
import { Header, HeaderContent } from "@/components/navigation/shell-styles";

export function NativeFrame({ heading, children }: { heading: string; children: ReactNode }) {
  return <>
    <Header><HeaderContent $wide><BrandLogo variant="inverse" /><ThemeToggle /></HeaderContent></Header>
    <PageMain><Container><Stack><h1>{heading}</h1>{children}</Stack></Container></PageMain>
  </>;
}
