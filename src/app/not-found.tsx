import { PublicShell } from "@/app/_components/public-shell";
import { BodyText, PageHeading, Stack } from "@/components/ui/layout";
import { createMessages } from "@/i18n/messages";

export default function NotFoundPage() {
  const messages = createMessages();
  return (
    <PublicShell>
      <Stack>
        <PageHeading>{messages.text("notFound.title")}</PageHeading>
        <BodyText>{messages.text("notFound.description")}</BodyText>
      </Stack>
    </PublicShell>
  );
}
