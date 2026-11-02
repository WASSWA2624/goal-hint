"use client";

import { useId, type CSSProperties, type ReactNode } from "react";
import styled from "styled-components";
import {
  CardIcon, ChartIcon, ChevronDownIcon, DocumentIcon, GridIcon, InfoIcon,
  MoonIcon, SignInIcon, SlipIcon, SunIcon, UserIcon, UserPlusIcon,
} from "@/components/ui/icons";
import type { HeaderReviewDesign } from "./designs";
import { HeaderReviewBrand } from "./header-review-brand";
import { authLabels } from "@/i18n/messages/auth";

export type HeaderReviewSession = "guest" | "member" | "admin";

const Sample = styled.div`
  container-type: inline-size;
  color: ${({ theme }) => theme.header.text};
  background: ${({ theme }) => theme.header.background};
  font-size: var(--gh-font-body);
  button, summary { font: inherit; cursor: pointer; }
  :is(button, summary):focus-visible { outline: var(--gh-stroke-strong) solid ${({ theme }) => theme.color.focus}; outline-offset: calc(-1 * var(--gh-size-0_75)); }
`;
const Rail = styled.header`
  display: flex; align-items: center; gap: var(--gh-spacing-4);
  block-size: var(--rail-height); padding-inline: var(--gh-spacing-5);
  border-block-end: var(--gh-stroke-thin) solid ${({ theme }) => theme.header.border};
  > [data-brand] { flex: none; display: flex; align-items: center; padding: 0; border: 0; background: transparent; }
  > [data-navigation] { flex: 1; min-inline-size: 0; display: flex; align-self: stretch; align-items: center; gap: var(--gh-spacing-0_5); }
  [data-navigation] > button, [data-navigation] > details > summary {
    display: inline-flex; align-items: center; gap: var(--gh-spacing-1_25); block-size: 100%;
    padding: 0 var(--gh-spacing-2_25); border: 0; border-block-end: var(--gh-stroke-strong) solid transparent;
    background: transparent; color: ${({ theme }) => theme.header.mutedText}; white-space: nowrap;
  }
  [data-navigation] > button[aria-current="page"] {
    border-block-end-color: ${({ theme }) => theme.header.accent}; color: ${({ theme }) => theme.header.accent};
  }
  [data-navigation] svg { font-size: var(--gh-font-section); flex: none; }
  [data-navigation] > details { block-size: 100%; }
  [data-actions] { display: flex; align-items: center; gap: var(--rail-gap); margin-inline-start: auto; flex: none; }
  [data-control] {
    display: inline-flex; align-items: center; justify-content: center; flex: none; gap: var(--gh-spacing-1_25);
    block-size: var(--control-height); min-inline-size: var(--control-height); padding: var(--gh-spacing-1) var(--gh-spacing-2_25);
    border: var(--gh-stroke-thin) solid transparent; color: ${({ theme }) => theme.header.text};
    background: ${({ theme }) => theme.header.controlFill}; white-space: nowrap; line-height: var(--gh-leading-solid);
  }
  [data-control] svg { flex: none; font-size: var(--gh-font-section); }
  [data-control="utility"] { padding: var(--gh-spacing-1); }
  [data-control="login"] { background: transparent; border-color: ${({ theme }) => theme.header.controlBorder}; }
  [data-control="register"] { color: ${({ theme }) => theme.header.onAccent}; background: ${({ theme }) => theme.header.accent}; }
  [data-count] { font-size: var(--gh-font-caption); font-weight: var(--gh-weight-bold); font-variant-numeric: tabular-nums; }
  [data-mobile-icon] { display: none; }
  :is([data-control], [data-navigation] button):hover { filter: brightness(0.92); }

  &[data-device="mobile"] {
    gap: var(--gh-spacing-1); padding-inline: var(--gh-spacing-2);
    > [data-brand] { min-block-size: var(--gh-size-11); }
    [data-control] { block-size: var(--gh-size-11); min-inline-size: var(--gh-size-11); padding: var(--gh-spacing-1) var(--gh-spacing-1_5); font-size: var(--gh-font-secondary); }
    [data-control="utility"] { padding: var(--gh-spacing-1); }
    [data-actions] { gap: min(var(--rail-gap), var(--gh-spacing-1)); }
    [data-auth-icon] { display: none; }
    [data-control="payment"] > [data-label] { display: none; }
    [data-mobile-icon] { display: block; }
  }
  &[data-variant="slim"] [data-navigation] > button { padding-inline: var(--gh-spacing-1_75); }
  &[data-variant="slim"][data-device="mobile"] {
    [data-actions] { gap: 0; }
    [data-control] { background: transparent; border-color: transparent; color: ${({ theme }) => theme.header.text}; }
    [data-control="register"] { color: ${({ theme }) => theme.header.accent}; font-weight: var(--gh-weight-bold); }
  }
  &[data-variant="quiet"] {
    [data-control="utility"], [data-control="login"], [data-control="payment"] { background: transparent; border-color: transparent; }
  }
  &[data-variant="divided"] {
    > [data-brand] { padding-inline-end: var(--gh-spacing-4); border-inline-end: var(--gh-stroke-thin) solid ${({ theme }) => theme.header.border}; }
    [data-actions] { padding-inline-start: var(--gh-spacing-3); border-inline-start: var(--gh-stroke-thin) solid ${({ theme }) => theme.header.border}; }
    [data-control="utility"] { background: transparent; }
    &[data-device="mobile"] > [data-brand] { padding-inline-end: var(--gh-spacing-1); }
    &[data-device="mobile"] [data-actions] { padding-inline-start: 0; border: 0; }
  }
  &[data-variant="joined"] {
    [data-control] { border-color: ${({ theme }) => theme.header.border}; }
    [data-actions] > :not(:first-child) { margin-inline-start: calc(-1 * var(--gh-spacing-0_25)); }
  }
  &[data-variant="outlined"] [data-control] {
    border-color: ${({ theme }) => theme.header.controlBorder}; background: transparent; color: ${({ theme }) => theme.header.text};
  }
  &[data-variant="contrast"] :is([data-control="payment"], [data-control="register"]) {
    color: ${({ theme }) => theme.header.onAccent}; background: ${({ theme }) => theme.header.accent};
  }
  &[data-variant="centered"] > [data-navigation] { justify-content: center; }
  &[data-variant="centered"][data-device="mobile"] {
    [data-actions] { gap: 0; background: ${({ theme }) => theme.header.controlFill}; }
    [data-control] { background: transparent; border-color: transparent; color: ${({ theme }) => theme.header.text}; }
    [data-control="register"] { color: ${({ theme }) => theme.header.accent}; }
  }
  &[data-variant="underlined"] {
    [data-control] { background: transparent; }
    :is([data-control="payment"], [data-control="login"], [data-control="register"]) {
      color: ${({ theme }) => theme.header.accent}; border-color: transparent;
      border-block-end: var(--gh-stroke-strong) solid ${({ theme }) => theme.header.accent};
    }
    [data-control="utility"] { border-block-end: var(--gh-stroke-strong) solid ${({ theme }) => theme.header.border}; }
  }
  @container (max-width: ${({ theme }) => theme.viewport[68.75]}) { [data-secondary-nav] { display: none !important; } }
  @container (max-width: ${({ theme }) => theme.viewport[21.875]}) {
    &[data-device="mobile"] [data-control="register"] > [data-label] { display: none; }
    &[data-device="mobile"] [data-control="register"] > [data-auth-icon] { display: block; }
  }
`;
const Disclosure = styled.details`
  position: relative; flex: none;
  > summary { list-style: none; }
  > summary::-webkit-details-marker { display: none; }
  > div {
    position: absolute; inset-block-start: calc(100% + var(--gh-spacing-1)); inset-inline-end: 0; z-index: var(--gh-layer-control);
    inline-size: var(--gh-size-43); padding: var(--gh-spacing-1); color: ${({ theme }) => theme.color.text};
    border: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border}; background: ${({ theme }) => theme.color.surface};
    box-shadow: ${({ theme }) => theme.shadow.popover};
  }
  > div > button {
    display: block; inline-size: 100%; min-block-size: var(--gh-size-11); text-align: start; padding: var(--gh-spacing-2);
    border: 0; background: transparent; color: inherit;
    &:hover { background: ${({ theme }) => theme.color.rowHover}; }
  }
  [data-menu-identity] { display: block; padding: var(--gh-spacing-2); border-block-end: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border}; font-size: var(--gh-font-secondary); }
  [data-menu-performance] { display: none; }
  @container (max-width: ${({ theme }) => theme.viewport[68.75]}) { [data-menu-performance] { display: block; } }
`;
const Context = styled.div`
  display: flex; justify-content: space-between; align-items: center; gap: var(--gh-spacing-3); padding: var(--gh-spacing-3) var(--gh-spacing-5);
  min-block-size: var(--gh-size-12); font-size: var(--gh-font-secondary); background: ${({ theme }) => theme.color.page};
  color: ${({ theme }) => theme.color.mutedText};
  > strong { color: ${({ theme }) => theme.color.text}; font-weight: var(--gh-weight-semibold); }
  [data-device="mobile"] + & { padding: var(--gh-spacing-3) var(--gh-spacing-2); }
`;

function Menu({ label, children, control, administrator = false, onPreview }: {
  label: string; children: ReactNode; control?: string; administrator?: boolean; onPreview: (message: string) => void;
}) {
  const id = useId();
  return <Disclosure onKeyDown={(event) => {
    if (event.key === "Escape") { event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); }
  }}>
    <summary aria-label={label} aria-controls={id} data-control={control}>{children}</summary>
    <div id={id}>
      {control && <span data-menu-identity>{administrator ? "Administrator" : "Sample member"}</span>}
      {(control ? (administrator ? [authLabels.signOut] : ["My account", authLabels.signOut]) : ["Performance", "About", "Contact", "Privacy", "Terms"]).map((item) =>
        <button key={item} type="button" data-menu-performance={item === "Performance" ? "" : undefined} onClick={(event) => {
          onPreview(`${item} preview — this gallery uses sample accounts.`);
          const details = event.currentTarget.closest("details");
          if (details) { details.open = false; details.querySelector("summary")?.focus(); }
        }}>{item}</button>)}
    </div>
  </Disclosure>;
}

export function HeaderSample({ design, device, session, dark, onTheme, onPreview }: {
  design: HeaderReviewDesign; device: "desktop" | "mobile"; session: HeaderReviewSession; dark: boolean;
  onTheme: () => void; onPreview: (message: string) => void;
}) {
  const mobile = device === "mobile";
  const style = {
    "--rail-height": `${mobile ? design.mobileHeight : design.desktopHeight}px`,
    "--control-height": `${design.controlHeight}px`, "--rail-gap": `${design.gap}px`,
  } as CSSProperties;
  const action = (label: string) => () => onPreview(`${label} preview — the live application is unchanged.`);
  return <Sample data-header-sample={device} data-session={session} style={style}>
    <Rail data-device={device} data-variant={design.variant} aria-label={`${design.name} ${device} header`}>
      <button type="button" data-brand aria-label="Goal Hint home" onClick={action("Home")}>
        <HeaderReviewBrand height={mobile ? 20 : design.brandHeight} />
      </button>
      {!mobile && <nav data-navigation aria-label="Preview primary navigation">
        {session === "admin" && <button type="button" onClick={action("Admin dashboard")}><GridIcon />Admin</button>}
        <button type="button" aria-current="page" onClick={action("Best slips")}><SlipIcon />Best slips</button>
        <button type="button" onClick={action("Matches")}><GridIcon />Matches</button>
        <button type="button" onClick={action("Slips")}><DocumentIcon />Slips</button>
        <button type="button" data-secondary-nav onClick={action("Performance")}><ChartIcon />Performance</button>
        <button type="button" data-secondary-nav onClick={action("About")}><InfoIcon />About</button>
        <Menu label="More navigation" onPreview={onPreview}>More<ChevronDownIcon /></Menu>
      </nav>}
      <div data-actions>
        {session === "admin" && <button type="button" data-control="payment" aria-label="Payments, 3 awaiting review" onClick={action("Payments")}>
          <span data-mobile-icon><CardIcon /></span><span data-label>Payments</span><strong data-count>3</strong>
        </button>}
        {session === "guest" && <>
          <button type="button" data-control="login" onClick={action(authLabels.signIn)}><span data-auth-icon><SignInIcon /></span><span data-label>{authLabels.signIn}</span></button>
          <button type="button" data-control="register" aria-label={authLabels.signUp} onClick={action(authLabels.signUp)}><span data-auth-icon><UserPlusIcon /></span><span data-label>{authLabels.signUp}</span></button>
        </>}
        <button type="button" data-control="utility" aria-label={`Switch previews to ${dark ? "light" : "dark"} theme`} onClick={onTheme}>
          {dark ? <SunIcon /> : <MoonIcon />}
        </button>
        {session !== "guest" && <Menu label="Account menu" control="utility" administrator={session === "admin"} onPreview={onPreview}><UserIcon /></Menu>}
      </div>
    </Rail>
    <Context><strong>Best slips</strong><span>{mobile ? "Phone preview" : "Desktop preview · primary navigation stays in one row"}</span></Context>
  </Sample>;
}
