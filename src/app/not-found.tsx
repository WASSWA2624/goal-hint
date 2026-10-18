import type { Metadata } from "next";
import { PublicShell } from "@/app/_components/public-shell";
import { BodyText, PageHeading, Stack } from "@/components/ui/layout";
import { createMessages } from "@/i18n/messages";
import { FallbackStyleProvider } from "@/styles/provider";

/** Missing pages get their own title rather than inheriting the home page title from the root layout. */
export const metadata: Metadata = { title: createMessages().text("notFound.metadataTitle"), description: createMessages().text("notFound.description") };

export default function NotFoundPage() {
  const messages = createMessages();
  return (
    <FallbackStyleProvider>
      <PublicShell>
        <Stack>
          <PageHeading>{messages.text("notFound.title")}</PageHeading>
          <BodyText>{messages.text("notFound.description")}</BodyText>
        </Stack>
      </PublicShell>
    </FallbackStyleProvider>
  );
}
