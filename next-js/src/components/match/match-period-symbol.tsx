import { Icon } from "@/components/ui/icons";
import type { MatchPeriodMarker } from "@/domain/match-event-presentation";

export function MatchPeriodSymbol({ period }: { period: MatchPeriodMarker }) {
  if (period === "full-time") return <Icon strokeWidth={1.6}><path d="M3 10h9l4-3h5v4l-3 2v2a5 5 0 1 1-10 0v-1H3Z" /><circle cx="13" cy="15" r="1" /></Icon>;
  if (period === "half-time" || period === "extra-time-interval") return <Icon><path d="M8 5v14M16 5v14" /></Icon>;
  if (period === "penalties") return <Icon><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="2" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></Icon>;
  return <Icon strokeWidth={1.7}><circle cx="11" cy="12" r="8" /><path d="M11 7v5l3 2M18 3h4M20 1v4" /></Icon>;
}
