import { Icon } from "@/components/ui/icons";
import type { MatchEventKind } from "@/domain/match-event-presentation";

/** Familiar football symbols retain their physical card colours in both application themes. */
export function MatchEventSymbol({ kind }: { kind: MatchEventKind }) {
  if (kind === "yellow-card" || kind === "red-card" || kind === "second-yellow" || kind === "card") return <Icon strokeWidth={1.2} data-event-symbol={kind}>
    {kind === "second-yellow" && <rect x="4" y="3" width="11" height="15" rx=".7" fill="#FACC15" stroke="#805A00" />}
    <rect x={kind === "second-yellow" ? 9 : 6} y={kind === "second-yellow" ? 7 : 3} width="12" height="17" rx=".7"
      fill={kind === "yellow-card" ? "#FACC15" : kind === "card" ? "none" : "#E53935"} stroke={kind === "yellow-card" ? "#805A00" : kind === "card" ? "currentColor" : "#A51E22"} />
    {kind === "card" && <path d="M10 8h4M10 12h4M10 16h2" />}
  </Icon>;
  if (kind === "substitution") return <Icon strokeWidth={2.2} data-event-symbol={kind}>
    <path data-arrow="on" d="M3 7h17m-5-4 5 4-5 4" /><path data-arrow="off" d="M21 17H4m5-4-5 4 5 4" />
  </Icon>;
  if (kind === "var") return <Icon strokeWidth={1.6} data-event-symbol={kind}>
    <rect x="2.5" y="3.5" width="19" height="14" rx="1" /><path d="M12 18v3M8 21h8" />
    <text x="12" y="12.8" textAnchor="middle" fill="currentColor" stroke="none" fontSize="6" fontWeight="800" fontFamily="sans-serif">VAR</text>
  </Icon>;
  return <Icon strokeWidth={1.25} data-event-symbol={kind}>
    <circle cx="12" cy="12" r="9" fill="#fff" stroke="#344054" /><path d="m12 7 4 3-1.5 4.5h-5L8 10Z" fill="#344054" stroke="#344054" />
    <path d="m12 3 0 4m8 1-4 2m1.5 9-3-4.5m-8 4.5 3-4.5M4 8l4 2" stroke="#344054" />
    {kind === "missed-penalty" && <path d="m3 3 18 18M21 3 3 21" stroke="#DC2626" strokeWidth="2.4" />}
    {kind === "penalty-goal" && <circle cx="19" cy="5" r="3" fill="currentColor" stroke="none" />}
    {kind === "own-goal" && <path d="M3 3h5v5M3 3l6 6" stroke="currentColor" strokeWidth="2.4" />}
  </Icon>;
}
