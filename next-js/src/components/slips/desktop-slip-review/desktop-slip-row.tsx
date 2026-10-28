"use client";

import type { SlipSelection } from "@/domain/slip-builder";
import type { DesktopPreviewMatchState } from "../desktop-slip-preview-data";
import { DesktopSlipRow as ProductionRow } from "../desktop-slip/desktop-slip-row";

/** Synthetic review states use the same formatting, alignment and tooltips as production rows. */
export function DesktopSlipRow({ selection, locale, state }: {
  selection: SlipSelection; locale: string; state: DesktopPreviewMatchState;
}) {
  return <ProductionRow selection={selection} locale={locale} preview matchStates={[{
    ...state, fixtureId: selection.fixtureId, family: selection.family, selection: selection.selection,
    ...(selection.forecast ? { forecast: selection.forecast } : {}),
  }]} />;
}
