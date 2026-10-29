import { createMessages } from "@/i18n/messages";
import { TextLink } from "@/components/ui/controls";
import { subscriberHref } from "@/domain/subscriber-navigation";

/** Plain subscriber copy shared by drawers and revision snapshots. */
export function SubscriberNotice({ locale = "en", kind = "history", signedIn = false, returnTo = "/en" }: {
  locale?: string; kind?: "card" | "markets" | "analysis" | "history"; signedIn?: boolean; returnTo?: string;
}) {
  const messages = createMessages(locale), text = messages.text(`paywall.${kind}`);
  return kind === "card" ? <span data-subscriber-notice>{text}</span>
    : <TextLink data-subscriber-notice href={subscriberHref(signedIn, returnTo)} prefetch={false}>{text} {messages.text(signedIn ? "subscribe.title" : "auth.signUp")}</TextLink>;
}
