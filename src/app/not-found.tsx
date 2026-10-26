import { PublicShell } from "@/app/_components/public-shell";
import { BodyText, PageHeading, Stack } from "@/components/ui/layout";
import { createMessages } from "@/i18n/messages";
import { notFoundMetadata } from "@/server/seo/metadata";
import { FallbackStyleProvider } from "@/styles/provider";

/** Missing pages get their own title and social tags rather than inheriting the home page's from the root layout. */
export const metadata = notFoundMetadata();

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
