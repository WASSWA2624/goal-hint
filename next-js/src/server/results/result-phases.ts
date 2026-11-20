import "server-only";

type ScorePair = Readonly<{ home: number | null; away: number | null }>;
type CompleteScore = Readonly<{ home: number; away: number }>;
type FinalPhaseResult = Readonly<{ extraTimeScore: ScorePair; penaltyScore: ScorePair }>;

export function completeResultScore(pair: ScorePair | undefined): CompleteScore | null {
  return pair?.home != null && pair.away !== null ? { home: pair.home, away: pair.away } : null;
}

/** Use explicit named provider fields. Some fixtures proceed directly to a shootout. */
export function verifiedFinalPhaseScores(status: string, result: FinalPhaseResult | null) {
  const extraTime = status === "finished-extra-time" || status === "finished-penalties"
    ? completeResultScore(result?.extraTimeScore) : null;
  const penalties = status === "finished-penalties" ? completeResultScore(result?.penaltyScore) : null;
  return { extraTime, shootout: penalties && penalties.home !== penalties.away ? penalties : null };
}

export function hasRequiredFinalPhase(status: string, result: FinalPhaseResult | null): boolean {
  const { extraTime, shootout } = verifiedFinalPhaseScores(status, result);
  return status === "finished-extra-time" ? extraTime !== null : status === "finished-penalties" ? shootout !== null : true;
}
