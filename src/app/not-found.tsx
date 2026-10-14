import { PublicShell } from "@/app/_components/public-shell";
import { BodyText, PageHeading, Stack } from "@/components/ui/layout";
import { createMessages } from "@/i18n/messages";
import { FallbackStyleProvider } from "@/styles/provider";

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
