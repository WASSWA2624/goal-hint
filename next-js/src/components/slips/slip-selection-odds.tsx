import { VisuallyHidden } from "@/components/ui/visually-hidden";
import type { SlipSelection } from "@/domain/slip-builder";

export function SlipSelectionOdds({ selection }: { selection: SlipSelection }) {
  const bookmaker = selection.bookmaker?.name;
  return bookmaker ? <span title={bookmaker} data-slip-bookmaker={bookmaker}>
    {selection.odds}<VisuallyHidden> · {bookmaker}</VisuallyHidden>
  </span> : selection.odds;
}
