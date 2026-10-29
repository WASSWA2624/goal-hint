"use client";

import type { ReactNode } from "react";
import { HeaderBrand } from "@/components/ui/brand";
import { CheckIcon, ChevronDownIcon, ChevronRightIcon, MoonIcon, SunIcon, UserIcon, UserPlusIcon } from "@/components/ui/icons";
import { bannerReviewLabels as labels, bannerReviewOffer as offer, type BannerReviewState } from "./designs";
import type { MobileBannerReviewDesign } from "./mobile-designs";
import { MobileHeader, MobileMessage, MobileSample } from "./mobile-banner-sample-styles";

type PreviewAction = (label: string) => void;
type SampleProps = {
  design: MobileBannerReviewDesign; state: BannerReviewState; dark: boolean;
  onTheme: () => void; onAction: PreviewAction;
};

/** Every concept keeps the same compact phone header and approved brand artwork. */
function HeaderContext({ state, dark, onTheme, onAction }: Omit<SampleProps, "design">) {
  return <MobileHeader data-mobile-banner-header aria-label="Mobile header preview">
    <button type="button" data-mobile-home aria-label="Goal Hint home" onClick={() => onAction("Home")}><HeaderBrand height={20} alt="" /></button>
    <div data-mobile-header-actions>
      {state === "signed-out" && <>
        <button type="button" onClick={() => onAction(labels.signIn)}>{labels.signIn}</button>
        <button type="button" data-mobile-header-primary aria-label={labels.signUp} onClick={() => onAction(labels.signUp)}>
          <span data-mobile-sign-up-icon><UserPlusIcon /></span><span data-mobile-sign-up-text>{labels.signUp}</span>
        </button>
      </>}
      <button type="button" data-mobile-header-icon aria-label={`Switch previews to ${dark ? "light" : "dark"} theme`} onClick={onTheme}>{dark ? <SunIcon /> : <MoonIcon />}</button>
      {state !== "signed-out" && <button type="button" data-mobile-header-icon aria-label={labels.account} onClick={() => onAction(labels.account)}><UserIcon /><ChevronDownIcon /></button>}
    </div>
  </MobileHeader>;
}

function Action({ label, onAction, kind = "text", arrow = false }: {
  label: string; onAction: PreviewAction; kind?: "text" | "button" | "outline"; arrow?: boolean;
}) {
  return <button type="button" data-mobile-link={kind} onClick={() => onAction(label)}>{label}{arrow && <ChevronRightIcon />}</button>;
}

function Invitation({ onAction }: { onAction: PreviewAction }) {
  return <span data-mobile-auth><Action label={labels.signUp} onAction={onAction} /><span> / </span><Action label={labels.signIn} onAction={onAction} /></span>;
}

function StateMark({ state }: { state: BannerReviewState }) {
  return <span data-mobile-step-mark role="img" aria-label={state === "active" ? "Access unlocked" : state === "signed-out" ? "Account step" : "Plan step"}>
    {state === "active" ? <CheckIcon /> : state === "signed-out" ? "1" : "2"}
  </span>;
}

function Contents({ design, state, onAction }: Pick<SampleProps, "design" | "state" | "onAction">): ReactNode {
  const signedOut = state === "signed-out", active = state === "active";
  const price = <span data-mobile-price>{offer.from}</span>;
  const invitation = <Invitation onAction={onAction} />;
  const access = <span data-mobile-access>Access {price}</span>;
  const activeCopy = <strong>Access active</strong>;
  const accountAction = <Action label={labels.account} onAction={onAction} arrow />;
  const action = signedOut ? invitation : <Action label={active ? labels.account : labels.subscribe} onAction={onAction} arrow />;

  switch (design.variant) {
    case "stacked":
      return <>{active ? activeCopy : access}<span data-mobile-actions>{action}</span></>;
    case "split":
      return <>{active ? activeCopy : access}<span data-mobile-actions>{signedOut ? invitation
        : <Action label={active ? labels.account : labels.subscribe} onAction={onAction} kind={active ? "text" : "outline"} />}</span></>;
    case "rule":
      return <>{active ? activeCopy : access}<span data-mobile-actions>{action}</span></>;
    case "price":
      return <><span data-mobile-price-anchor>{active ? <><CheckIcon /><strong>All unlocked</strong></>
        : <><span>Access</span><strong>{offer.from}</strong></>}</span><span data-mobile-actions>{action}</span></>;
    case "contrast":
      return <>{active ? activeCopy : access}<span data-mobile-actions>{signedOut ? invitation
        : <Action label={active ? labels.viewPredictions : labels.subscribe} onAction={onAction} kind={active ? "text" : "button"} />}</span></>;
    case "editorial":
      return <><span data-mobile-kicker>{active ? "Unlocked" : "Access"}</span>{!active && price}<span data-mobile-actions>{action}</span></>;
    case "steps":
      return <><StateMark state={state} />{active ? activeCopy : access}<span data-mobile-actions>{action}</span></>;
    case "edge":
      return <>{active ? activeCopy : access}<span data-mobile-edge-actions>{action}</span></>;
    case "quiet":
      return <>{active ? <><span data-mobile-status-icon><CheckIcon /></span>{activeCopy}</> : access}
        <span data-mobile-actions>{action}</span></>;
    default:
      return <>{active ? <>{activeCopy}<span data-mobile-separator>·</span>{accountAction}</>
        : <>{access}<span data-mobile-separator>·</span>{action}</>}</>;
  }
}

/** Isolated concepts use illustrative state; no action changes a real account or subscription. */
export function MobileBannerSample({ design, state, dark, onTheme, onAction }: SampleProps) {
  return <MobileSample data-mobile-banner-sample={state}>
    <HeaderContext state={state} dark={dark} onTheme={onTheme} onAction={onAction} />
    <MobileMessage data-mobile-banner-message data-variant={design.variant} data-access={state}>
      <Contents design={design} state={state} onAction={onAction} />
    </MobileMessage>
  </MobileSample>;
}
