import "server-only";
import { ButtonLink, TextLink } from "@/components/ui/controls";
import { Inline, Stack } from "@/components/ui/layout";
import type { ReportingDate } from "@/domain/calendar";
import { feedDateNavigation } from "@/domain/feed-date-navigation";
import type { FeedQuery } from "@/domain/feed-query";
import { createMessages } from "@/i18n/messages";

export function FeedDateLinks({ query, today }: { query: FeedQuery; today: ReportingDate }) {
  const messages = createMessages(query.locale), links = feedDateNavigation(query, today);
  return <nav aria-label={messages.text("feed.dateNavigation")}>
    <Stack $gap="sm">
      <Inline>
        {links.presets.map(({ kind, href, current }) => <ButtonLink key={kind} href={href} prefetch={false}
          variant={current ? "primary" : "secondary"} aria-current={current ? "date" : undefined}>
          {messages.text(`feed.date.${kind}`)}
        </ButtonLink>)}
      </Inline>
      <Inline>
        {(["previous", "next"] as const).map((direction) => {
          const link = links[direction];
          return link && <TextLink key={direction} href={link.href} prefetch={false}
            aria-label={`${messages.text(`feed.date.${direction}`)}: ${messages.reportingDate(link.date)}`}>
            {messages.text(`feed.date.${direction}`)}
          </TextLink>;
        })}
      </Inline>
    </Stack>
  </nav>;
}
