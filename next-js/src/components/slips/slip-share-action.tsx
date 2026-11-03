"use client";

import dynamic from "next/dynamic";
import { useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { getSlipSharingSnapshot, subscribeMemberSession } from "@/components/members/member-session";
import { ShareIcon } from "@/components/ui/icons";
import type { SharedSlip, ShareSlipSource } from "@/domain/shared-slips";
import type { BuiltSlip } from "@/domain/slip-builder";
import { createMessages } from "@/i18n/messages";
import { ShareTrigger } from "./sharing/slip-share-styles";
import { useRefreshedSlipMatchStates } from "./slip-match-refresh";
import { slipHeaderState } from "./slip-header-outcome";
import { slipMatchStateForSelection, type SlipMatchState } from "@/domain/slip-match-state";
import type { SlipResultView } from "@/domain/slip-snapshot";
import type { SlipStatus } from "@/domain/slip-status";

const SlipShareDrawer = dynamic(() => import("./sharing/slip-share-drawer").then((module) => module.SlipShareDrawer));
const serverCanShare = () => false;

export function SlipShareAction({ source, sharedSlip, localSlip, locale, iconOnly = false, publicHref, publishedAt, matchStates, results, status, outcome }: {
  publicHref?: string; source?: ShareSlipSource; sharedSlip?: SharedSlip; localSlip?: BuiltSlip; locale: string; iconOnly?: boolean;
  publishedAt?: number; matchStates?: readonly SlipMatchState[]; results?: SlipResultView["results"]; status?: SlipStatus; outcome?: SlipResultView["outcome"];
}) {
  const currentStates = useRefreshedSlipMatchStates() ?? matchStates;
  const resultByFixture = useMemo(() => new Map(results?.map(result => [result.fixtureId, result])), [results]);
  const savedStatus = sharedSlip?.status;
  const savedOutcome = savedStatus === "won" || savedStatus === "lost" ? savedStatus
    : savedStatus === "void" || savedStatus === "cancelled" ? "void" : "pending";
  const [open, setOpen] = useState(false), [cached, setCached] = useState(sharedSlip);
  const entitled = useSyncExternalStore(subscribeMemberSession, getSlipSharingSnapshot, serverCanShare);
  const canShare = !!(source || sharedSlip) && (entitled || !!publicHref);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId(), m = createMessages(locale);
  if (open && !canShare) setOpen(false);
  function close() {
    setOpen(false);
    requestAnimationFrame(() => trigger.current?.focus());
  }
  return <>
    <ShareTrigger ref={trigger} type="button" variant="quiet" data-share-slip disabled={!canShare} aria-haspopup="dialog" aria-expanded={open && canShare}
      data-share-icon-only={iconOnly ? "" : undefined} aria-label={iconOnly ? m.text("slipShare.share") : undefined}
      aria-description={!canShare ? m.text("slipShare.forbidden") : undefined} title={m.text(canShare ? "slipShare.share" : "slipShare.forbidden")}
      aria-controls={open ? id : undefined} onClick={(event) => { event.stopPropagation(); setOpen(true); }}><ShareIcon />{!iconOnly && m.text("slipShare.share")}</ShareTrigger>
    {open && canShare && <SlipShareDrawer id={id} {...(source ? { source } : {})} {...(cached ? { initialShared: cached } : {})}
      {...(localSlip ? { localSlip, presentation: { status: slipHeaderState(localSlip, results, currentStates, outcome ?? savedOutcome, status ?? savedStatus).status,
        ...(currentStates || results || sharedSlip?.selectionScores ? { selectionScores: Object.fromEntries(localSlip.selections.flatMap(selection => {
          const score = slipMatchStateForSelection(selection, currentStates)?.score ?? sharedSlip?.selectionScores?.[selection.fixtureId];
          const result = resultByFixture.get(selection.fixtureId);
          const observed = score ?? (result?.home !== null && result?.home !== undefined && result.away !== null ? { home: result.home, away: result.away } : null);
          return observed ? [[selection.fixtureId, observed]] : [];
        })) } : {}),
        selectionOutcomes: Object.fromEntries(localSlip.selections.map(selection => [selection.fixtureId,
          slipMatchStateForSelection(selection, currentStates)?.outcome ?? resultByFixture.get(selection.fixtureId)?.outcome ?? sharedSlip?.selectionOutcomes?.[selection.fixtureId] ?? "pending"])) } } : {})}
      {...(publishedAt !== undefined ? { createdAt: new Date(publishedAt).toISOString() } : {})}
      locale={locale} onPrepared={setCached} onClose={close} />}
  </>;
}
