"use client";

import { useEffect } from "react";
import { BrandLogo } from "@/components/ui/brand";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Container, PageMain, Stack } from "@/components/ui/layout";
import { Header, HeaderContent } from "@/components/navigation/shell-styles";

/** Actual shared brand/theme controls, with no account or application services. */
export default function IdentityFixture() {
  useEffect(() => {
    document.documentElement.dataset.identityFixtureReady = "true";
    return () => { delete document.documentElement.dataset.identityFixtureReady; };
  }, []);
  return <div data-identity-fixture>
    <Header><HeaderContent $wide><BrandLogo variant="inverse" /><ThemeToggle /></HeaderContent></Header>
    <PageMain><Container><Stack>
      <h1>Goal Hint appearance acceptance</h1>
      <p>This isolated document uses the application's shared branding and theme preference.</p>
    </Stack></Container></PageMain>
  </div>;
}
