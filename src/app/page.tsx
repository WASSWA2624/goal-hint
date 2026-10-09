import { BrandLogo } from "@/components/ui/brand";
import { Container, PageMain, Stack } from "@/components/ui/layout";
import { EmptyState } from "@/components/ui/feedback";
import type { ReactNode } from "react";

export default async function HomePage() {
  let preview: ReactNode = null;
  if (process.env.NODE_ENV === "development") {
    const { BrandDemo } = await import("@/components/dev/brand-demo");
    preview = <BrandDemo />;
  }

  return (
    <PageMain>
      <Container>
        <Stack $gap="lg">
          <BrandLogo alt="" />
          <EmptyState
            title="Goal Hint is in development"
            description="Predictions are not yet available."
            headingLevel={1}
          />
          {preview}
        </Stack>
      </Container>
    </PageMain>
  );
}
