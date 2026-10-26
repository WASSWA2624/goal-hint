"use client";

import { useEffect } from "react";
import { BrandLogo } from "@/components/ui/brand";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Container, PageMain, Stack } from "@/components/ui/layout";
import { Header, HeaderContent } from "@/components/navigation/shell-styles";
import release from "./release-generation.json";

/** Build-time public marker; no accounts, private services or native bridge. */
export default function ReleaseFixture() {
  useEffect(() => {
    document.documentElement.dataset.releaseFixtureReady = "true";
    return () => { delete document.documentElement.dataset.releaseFixtureReady; };
  }, []);
  return <div data-release-fixture data-release-generation={release.generation}>
    <Header><HeaderContent $wide><BrandLogo variant="inverse" /><ThemeToggle /></HeaderContent></Header>
    <PageMain><Container><Stack>
      <h1>Website update {release.generation}</h1>
      <p>This independently built Next.js deployment uses the shared Goal Hint interface.</p>
      <p>The Flutter shell is unchanged.</p>
    </Stack></Container></PageMain>
  </div>;
}
