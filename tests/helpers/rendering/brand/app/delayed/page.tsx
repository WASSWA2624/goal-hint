import { Suspense } from "react";
import { connection } from "next/server";
import { ButtonLink } from "@/components/ui/controls";
import { BodyText, Container, PageHeading, PageMain, Stack } from "@/components/ui/layout";
import { StatusText } from "@/components/ui/feedback";
import { StreamPanel } from "../stream-panel";
async function DelayedContent() {
  await new Promise<void>((resolve) => setTimeout(resolve, 900));
  return <StreamPanel data-testid="stream-panel"><BodyText>The delayed styled content has arrived.</BodyText></StreamPanel>;
}
export default async function DelayedPage() {
  await connection();
  return <PageMain><Container><Stack $gap="lg"><PageHeading>Delayed style check</PageHeading>
    <ButtonLink href="/" prefetch={false} variant="secondary">Return to the primitive checks</ButtonLink>
    <Suspense fallback={<StatusText tone="pending">Waiting for the delayed interface example.</StatusText>}>
      <DelayedContent />
    </Suspense>
  </Stack></Container></PageMain>;
}

