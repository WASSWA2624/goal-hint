"use client";

import type { ReactNode } from "react";
import { HeaderBrand } from "@/components/ui/brand";
import { CheckIcon, ChevronDownIcon, ChevronRightIcon, LockIcon, MoonIcon, SunIcon, UserIcon, UserPlusIcon } from "@/components/ui/icons";
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
  return <><Action label={labels.signUp} onAction={onAction} /> or <Action label={labels.signIn} onAction={onAction} /></>;
}

function StateIcon({ active }: { active: boolean }) {
  return <span data-mobile-status-icon={active ? "active" : "locked"}>{active ? <CheckIcon /> : <LockIcon />}</span>;
}

function Steps({ state }: { state: BannerReviewState }) {
  const completed = state === "active" ? 3 : state === "unsubscribed" ? 1 : 0;
  const items = ["Account", "Plan", "Access"];
  return <div data-mobile-steps role="group" aria-label={state === "active" ? "Account ready, plan active, access unlocked" : state === "unsubscribed" ? "Account ready, choose a plan next" : "Create an account, choose a plan, unlock access"}>
    {items.map((item, index) => <Step key={item} item={item} index={index} completed={completed} />)}
  </div>;
}

function Step({ item, index, completed }: { item: string; index: number; completed: number }) {
  return <>{index > 0 && <ChevronRightIcon data-mobile-step-arrow />}<span data-mobile-step={index === completed ? "current" : "other"}>
    <span data-mobile-step-mark>{index < completed ? <CheckIcon /> : index + 1}</span>{item}
  </span></>;
}

function Contents({ design, state, onAction }: Pick<SampleProps, "design" | "state" | "onAction">): ReactNode {
  const signedOut = state === "signed-out", active = state === "active";
  const price = <span data-mobile-price>{offer.from}</span>;
  const invitation = <Invitation onAction={onAction} />;
  const accountAction = <Action label={labels.account} onAction={onAction} arrow />;
  const nextAction = <Action label={active ? labels.account : labels.subscribe} onAction={onAction} arrow />;
  const sentence = active ? <><strong>Full access is active.</strong> All predictions and odds are unlocked. {accountAction}</>
    : signedOut ? <>{invitation} to unlock all predictions and odds {price}.</>
    : <>Unlock all predictions and odds {price}. <Action label={labels.subscribe} onAction={onAction} arrow /></>;

  switch (design.variant) {
    case "stacked":
      return <div data-mobile-copy><strong data-mobile-title>{active ? "You have full access." : "Every prediction. All the odds."}</strong>
        <div data-mobile-inline-actions>{signedOut ? <><span>{invitation}</span><span>{price}</span></>
          : active ? <><span data-mobile-muted>Explore your unlocked predictions.</span>{accountAction}</>
          : <>{price}<Action label={labels.subscribe} onAction={onAction} arrow /></>}</div>
      </div>;
    case "split":
      return <><StateIcon active={active} /><p data-mobile-copy><strong data-mobile-title>{active ? "Full access is active." : "All predictions and odds."}</strong>
        <span data-mobile-caption>{active ? "Your selections are unlocked." : price}</span></p>
        <div data-mobile-action-column>{signedOut ? <><Action label={labels.signUp} onAction={onAction} /><Action label={labels.signIn} onAction={onAction} /></>
          : <Action label={active ? labels.account : labels.subscribe} onAction={onAction} kind={active ? "text" : "button"} />}</div>
      </>;
    case "rule":
      return <div data-mobile-copy><strong data-mobile-title>{active ? "Access active." : "A little more insight."}</strong>
        <p>{active ? <>All predictions and odds unlocked. {accountAction}</>
          : signedOut ? <>{invitation} for full access {price}.</>
          : <>{price}. <Action label={labels.subscribe} onAction={onAction} arrow /></>}</p>
      </div>;
    case "price":
      return <><div data-mobile-price-anchor>{active ? <><StateIcon active /><strong>Unlocked</strong></> : <><span>from</span><strong>{offer.price}</strong></>}</div>
        <p data-mobile-copy>{active ? <>Full access is active. {accountAction}</>
          : signedOut ? <>{invitation} for all predictions and odds.</>
          : <>All predictions and odds. <Action label={labels.subscribe} onAction={onAction} arrow /></>}</p>
      </>;
    case "contrast":
      return <div data-mobile-copy><strong data-mobile-title>{active ? "Full access is active." : "See the full picture."}</strong>
        <div data-mobile-inline-actions>{signedOut ? <><span>{invitation}</span>{price}</>
          : active ? <><span>All predictions unlocked.</span><Action label={labels.viewPredictions} onAction={onAction} arrow /></>
          : <>{price}<Action label={labels.subscribe} onAction={onAction} arrow /></>}</div>
      </div>;
    case "editorial":
      return <div data-mobile-copy><div data-mobile-editorial-head><strong>{active ? "Subscriber access" : "Full access"}</strong>{!active && price}</div>
        <p>{active ? <>All predictions and odds unlocked. {accountAction}</>
          : signedOut ? <>{invitation} to explore every prediction.</>
          : <>All predictions and odds. {nextAction}</>}</p>
      </div>;
    case "steps":
      return <><Steps state={state} /><p data-mobile-copy>{active ? <><strong>Full access is active.</strong> {accountAction}</>
        : signedOut ? <>{invitation} to get started {price}.</>
        : <><Action label={labels.subscribe} onAction={onAction} /> {price} to unlock predictions.</>}</p></>;
    case "edge":
      return <><p data-mobile-copy><strong data-mobile-title>{active ? "You’re all set." : "All predictions and odds."}</strong>
        <span data-mobile-caption>{active ? "Full access is active." : price}</span></p>
        <div data-mobile-edge-actions>{signedOut ? <><Action label={labels.signUp} onAction={onAction} arrow /><Action label={labels.signIn} onAction={onAction} /></>
          : <Action label={active ? labels.account : labels.subscribe} onAction={onAction} arrow />}</div>
      </>;
    case "quiet":
      return <><StateIcon active={active} /><p data-mobile-copy>{active ? <>Access active. {accountAction}</>
        : signedOut ? <>{invitation} · All predictions and odds {price}.</>
        : <>Full access {price}. <Action label={labels.subscribe} onAction={onAction} arrow /></>}</p></>;
    default:
      return <><StateIcon active={active} /><p data-mobile-copy>{sentence}</p></>;
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
