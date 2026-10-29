"use client";

import type { ReactNode } from "react";
import { HeaderBrand } from "@/components/ui/brand";
import {
  ChartIcon, CheckIcon, ChevronDownIcon, ChevronRightIcon, DocumentIcon,
  GridIcon, InfoIcon, LockIcon, MoonIcon, SlipIcon, UserIcon,
} from "@/components/ui/icons";
import {
  bannerReviewLabels as labels, bannerReviewOffer as offer,
  type BannerReviewDesign, type BannerReviewState,
} from "./designs";
import { BannerRow, PreviewHeader, Sample } from "./banner-sample-styles";

type PreviewAction = (label: string) => void;

/** Context is identical across options; only the advertising row changes. */
function HeaderContext({ state, onAction }: { state: BannerReviewState; onAction: PreviewAction }) {
  return <PreviewHeader data-banner-header aria-label="Desktop header preview">
    <button type="button" data-home aria-label="Goal Hint home" onClick={() => onAction("Home")}><HeaderBrand height={24} alt="" /></button>
    <nav aria-label="Preview primary navigation">
      <button type="button" aria-current="page" onClick={() => onAction("Best slips")}><SlipIcon />Best slips</button>
      <button type="button" onClick={() => onAction("Matches")}><GridIcon />Matches</button>
      <button type="button" onClick={() => onAction("Slips")}><DocumentIcon />Slips</button>
      <button type="button" data-secondary-nav onClick={() => onAction("Performance")}><ChartIcon />Performance</button>
      <button type="button" data-secondary-nav onClick={() => onAction("About")}><InfoIcon />About</button>
      <button type="button" onClick={() => onAction("More navigation")}>More<ChevronDownIcon /></button>
    </nav>
    <div data-utilities>
      {state === "signed-out" && <>
        <button type="button" onClick={() => onAction(labels.signIn)}>{labels.signIn}</button>
        <button type="button" data-primary onClick={() => onAction(labels.signUp)}>{labels.signUp}</button>
      </>}
      <button type="button" aria-label="Theme preview" onClick={() => onAction("Theme")}><MoonIcon /></button>
      {state !== "signed-out" && <button type="button" aria-label={labels.account} onClick={() => onAction(labels.account)}><UserIcon /><ChevronDownIcon /></button>}
    </div>
  </PreviewHeader>;
}

function Action({ children, label, onAction, filled = false, arrow = false }: {
  children?: ReactNode; label: string; onAction: PreviewAction; filled?: boolean; arrow?: boolean;
}) {
  return <button type="button" data-link={filled ? "button" : "text"} onClick={() => onAction(label)}>
    {children ?? label}{arrow && <ChevronRightIcon />}
  </button>;
}

function Invitation({ onAction }: { onAction: PreviewAction }) {
  return <><Action label={labels.signUp} onAction={onAction} /> or <Action label={labels.signIn} onAction={onAction} /></>;
}

function StateIcon({ active }: { active: boolean }) {
  return <span data-icon data-active-icon={active ? "" : undefined}>{active ? <CheckIcon /> : <LockIcon />}</span>;
}

function BannerContents({ design, state, onAction }: { design: BannerReviewDesign; state: BannerReviewState; onAction: PreviewAction }) {
  const active = state === "active", signedOut = state === "signed-out";
  const price = <span data-price>{offer.from}</span>;
  const invitation = <Invitation onAction={onAction} />;
  const accountAction = <Action label={labels.account} onAction={onAction} arrow />;
  const subscribeAction = <Action label={labels.subscribe} onAction={onAction} arrow />;
  const predictionsAction = <Action label={labels.viewPredictions} onAction={onAction} arrow />;
  const sentence = active ? <><strong>Full access is active.</strong> All predictions and odds are unlocked.</>
    : signedOut ? <>{invitation} to unlock all predictions and odds {price}.</>
    : <><strong>Unlock all predictions and odds</strong> {price}.</>;
  const trailing = active ? accountAction : !signedOut ? subscribeAction : null;

  switch (design.variant) {
    case "split":
      return <>
        <span data-copy data-grow>{active ? <><StateIcon active /> <strong>Full access is active.</strong> Your predictions are ready.</>
          : <><strong>Every prediction. All the odds.</strong> <span data-muted>Full access {price}.</span></>}</span>
        <span data-actions>{signedOut ? <>{invitation}<span data-muted>to get started.</span></> : active ? predictionsAction : <Action label={labels.subscribe} onAction={onAction} filled arrow />}</span>
      </>;
    case "centered":
      return <span data-copy>{sentence}{trailing && <> &nbsp; {trailing}</>}</span>;
    case "rule":
      return <>
        <span data-kicker>{active ? "Access active" : "Your next insight"}</span>
        <span data-copy data-grow>{active ? "All predictions and odds are unlocked. Explore today’s selections." : signedOut ? <>{invitation} for full predictions and odds {price}.</> : <>Full predictions and odds {price}. Choose your plan.</>}</span>
        {active ? predictionsAction : !signedOut ? <Action label={labels.subscribe} onAction={onAction} filled arrow /> : null}
      </>;
    case "price":
      return <>
        <span data-price-anchor>{active ? <><StateIcon active /><strong>All unlocked</strong></> : <><small>from</small><strong>{offer.price}</strong></>}</span>
        <span data-copy data-grow>{active ? "Your subscription is active. All predictions and odds are yours to explore."
          : signedOut ? <>{invitation} to unlock all predictions and odds.</> : "One plan. All predictions and odds unlocked."}</span>
        {trailing}
      </>;
    case "editorial":
      return <>
        <span data-kicker>{active ? "Subscriber access" : "Full access"}</span>
        <span data-copy data-grow>{active ? <><strong>All predictions are unlocked.</strong> Thank you for being a subscriber.</>
          : signedOut ? <>{invitation} to explore more. All predictions and odds {price}.</>
          : <>More insight, one simple plan. All predictions and odds {price}.</>}</span>
        {active ? accountAction : !signedOut ? subscribeAction : null}
      </>;
    case "contrast":
      return <>
        <StateIcon active={active} />
        <span data-copy data-grow>{active ? <><strong>Your full access is active.</strong> Today’s predictions are ready to explore.</>
          : signedOut ? <>{invitation} — all predictions and odds {price}.</>
          : <><strong>See the full picture.</strong> Unlock predictions and odds {price}.</>}</span>
        {active ? predictionsAction : !signedOut ? <Action label={labels.subscribe} onAction={onAction} filled arrow /> : null}
      </>;
    case "stacked":
      return <>
        <span data-copy data-grow><span data-kicker>{active ? "You have full access" : "A little more insight"}</span>
          <span>{active ? "All predictions and odds are unlocked. Your next selection awaits."
            : signedOut ? <>{invitation} to unlock all predictions and odds {price}.</>
            : <>Unlock all predictions and odds {price}. Choose a plan that fits.</>}</span>
        </span>
        {active ? accountAction : !signedOut ? <Action label={labels.subscribe} onAction={onAction} filled arrow /> : null}
      </>;
    case "journey":
      return <>
        <span data-step><span data-step-number>{signedOut ? "1" : <CheckIcon />}</span>{signedOut ? <span>{invitation}</span> : "Account ready"}</span>
        <ChevronRightIcon data-step-arrow />
        <span data-step><span data-step-number>{active ? <CheckIcon /> : "2"}</span>{active ? "Subscription active" : signedOut ? <>Choose a plan {price}</> : <><Action label={labels.subscribe} onAction={onAction} /> {price}</>}</span>
        <ChevronRightIcon data-step-arrow />
        <span data-step><span data-step-number>{active ? <CheckIcon /> : "3"}</span>{active ? "All predictions unlocked" : "Unlock all predictions and odds"}</span>
        {active && <span data-actions>{accountAction}</span>}
      </>;
    case "quiet":
      return <>
        <StateIcon active={active} />
        <span data-copy data-grow>{active ? "You’re all set. All predictions and odds are unlocked."
          : signedOut ? <>{invitation} for all predictions and odds {price}.</>
          : <>Full predictions and odds are a plan away — {price}.</>}</span>
        {active ? accountAction : !signedOut ? subscribeAction : null}
      </>;
    default:
      return <><StateIcon active={active} /><span data-copy>{sentence}</span>{trailing && <span data-inline-tail>{trailing}</span>}</>;
  }
}

/** Review-only actions never create a session, subscribe, or change the live banner. */
export function BannerSample({ design, state, onAction }: {
  design: BannerReviewDesign; state: BannerReviewState; onAction: PreviewAction;
}) {
  return <Sample data-banner-sample={state}>
    <HeaderContext state={state} onAction={onAction} />
    <BannerRow data-banner-message data-banner-row data-variant={design.variant} data-access={state} $height={design.height}>
      <BannerContents design={design} state={state} onAction={onAction} />
    </BannerRow>
  </Sample>;
}
