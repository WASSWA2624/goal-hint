import { createMessages } from "@/i18n/messages";

/** Neutral boundary while the designed subscription entry points are implemented in 062. */
export function SubscriberNotice({ locale = "en" }: { locale?: string }) {
  return <span data-subscriber-notice>{createMessages(locale).text("access.required")}</span>;
}
