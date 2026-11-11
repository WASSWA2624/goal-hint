import "server-only";
import type { BestSlipsResult, BestSlipView, SlipPreviewView } from "../../domain/best-slips.ts";
import type { ContentAccess } from "../../domain/paywall.ts";
import { slipMatchStateForSelection } from "../../domain/slip-match-state.ts";
import { slipSelectionCard } from "../../domain/slip-card.ts";

/** Project a stored slip collection only for the viewer receiving it. */
export function gateBestSlips(result: BestSlipsResult, access: ContentAccess): BestSlipsResult {
  return { ...result, entitled: access.tier === "full", access: { tier: access.tier, signedIn: access.signedIn },
    slips: result.slips.map((view) => gateSlipView(view, access)) };
}

export function gateSlipView(view: BestSlipView, access: ContentAccess): BestSlipView;
export function gateSlipView(view: SlipPreviewView, access: ContentAccess): SlipPreviewView;
export function gateSlipView(view: SlipPreviewView, access: ContentAccess): SlipPreviewView {
  const entitled = access.tier === "full";
  const { rank, matchCount, totalOdds, averageProbability, id, publicationDay, publishedAt, outcome, status, completed } = view;
  const summary = { rank, matchCount, totalOdds, averageProbability,
    ...("estimatedProbability" in view ? { estimatedProbability: view.estimatedProbability } : {}),
    ...(id !== undefined ? { id } : {}), ...(publicationDay ? { publicationDay } : {}),
    ...(publishedAt !== undefined ? { publishedAt } : {}), ...(outcome ? { outcome } : {}),
    ...(status ? { status } : {}), ...(completed !== undefined ? { completed } : {}) };
  if (view.slip && (entitled || completed === true)) return { ...summary, slip: view.slip,
    ...(view.matchStates ? { matchStates: view.slip.selections.flatMap((selection) => {
      const state = slipMatchStateForSelection(selection, view.matchStates); return state ? [state] : [];
    }) } : {}) };
  if (!view.slip) return { ...summary, ...(view.preview ? { preview: view.preview } : {}) };
  const released = new Set(view.completedFixtureIds ?? []);
  return { ...summary, preview: view.slip.selections.map((selection) => {
    const state = view.matchStates && slipMatchStateForSelection(selection, view.matchStates);
    const card = slipSelectionCard(selection);
    return { fixture: { ...card.fixture, cycleId: null, status: state?.status ?? "unknown",
      score: state?.score ?? null, liveClock: state?.liveClock ?? null },
      pick: released.has(selection.fixtureId) ? { ...card.snapshotPick, outcome: state?.outcome ?? "pending" } : null };
  }) };
}
