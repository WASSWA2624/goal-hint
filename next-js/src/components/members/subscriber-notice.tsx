import { UnlockLink } from "./prediction-unlock";

/** Protected drawers and snapshots use the same compact action as prediction cards. */
export function SubscriberNotice({ locale = "en", signedIn = false, returnTo = "/en" }: {
  locale?: string; kind?: "card" | "markets" | "analysis" | "history"; signedIn?: boolean; returnTo?: string;
}) {
  return <UnlockLink locale={locale} signedIn={signedIn} returnTo={returnTo} />;
}
