"use client";

import { usePathname } from "next/navigation";
import { Button, ButtonLink } from "@/components/ui/controls";
import { EmptyState } from "@/components/ui/feedback";
import { Container, PageHeading, PageMain, Stack } from "@/components/ui/layout";
import { createMessages } from "@/i18n/messages";

/** The feed, dated archive (predictions/error.tsx) and match pages' recovery for a failed public read answered with 5xx
 * (PublicReadUnavailableError) or any other error there; other pages keep the default boundary, since this copy names matches.
 * Retry re-fetches the segment; the links are ordinary <a href> elements, so they also work without scripts. */
export default function MatchesError({ retry }: { error: unknown; retry: () => void }) {
  const messages = createMessages(), detail = /^\/[^/]+\/matches\/[^/]+\/[^/]+/u.test(usePathname() ?? "");
  const title = messages.text(detail ? "detail.unavailableTitle" : "feed.unavailableTitle");
  // The 5xx document has no route metadata, so the heading also names the tab.
  return <PageMain id="main-content" tabIndex={-1}>
    <title>{title}</title>
    <Container>
      <Stack>
        <PageHeading>{title}</PageHeading>
        <EmptyState title={messages.text(detail ? "detail.unavailable" : "feed.unavailable")}
          description={detail ? messages.text("detail.retryDescription") : undefined}
          action={<>
            <Button onClick={() => retry()}>{messages.text("feed.retry")}</Button>
            <ButtonLink href="/en/matches" prefetch={false} variant="secondary">{messages.text("navigation.matches")}</ButtonLink>
            <ButtonLink href="/en" prefetch={false} variant="quiet">{messages.text("navigation.home")}</ButtonLink>
          </>} />
      </Stack>
    </Container>
  </PageMain>;
}
