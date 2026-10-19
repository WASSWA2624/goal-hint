import { createMessages } from "@/i18n/messages";

/** Plain subscriber copy shared by drawers and revision snapshots. */
export function SubscriberNotice({ locale = "en", kind = "history" }: { locale?: string; kind?: "card" | "markets" | "analysis" | "history" }) {
  return <span data-subscriber-notice>{createMessages(locale).text(`paywall.${kind}`)}</span>;
}
