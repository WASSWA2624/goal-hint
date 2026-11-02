"use client";

import styled from "styled-components";
import { Button } from "@/components/ui/controls";

/** Authentication surfaces follow the app shell's full-width content rails. */
export const AccountCard = styled.section`
  inline-size: 100%; min-inline-size: 0;
  background: ${({ theme }) => theme.color.surface};
  border: 0;
  border-radius: ${({ theme }) => theme.radius.surface};
  font-size: var(--gh-font-emphasis); line-height: var(--gh-leading-reading);
  button, a { min-block-size: var(--form-control-height); }
  input:not([type="hidden"], [type="checkbox"], [type="radio"], [type="range"]) { min-block-size: var(--form-control-height); font-size: var(--gh-font-section); }
  button { font-size: var(--gh-font-emphasis); }
  h2 { font-size: var(--gh-font-section); font-weight: var(--gh-weight-medium); margin: 0 0 var(--gh-spacing-3); }
`;
export const AccountCardHeading = styled.div`
  background: ${({ theme }) => theme.color.surfaceMuted};
  display: flex; align-items: center; gap: var(--gh-spacing-2_5);
  min-block-size: var(--gh-size-14_5); padding: var(--gh-spacing-2_5) var(--gh-spacing-4);
  border-block-end: 0;
  > svg { color: ${({ theme }) => theme.color.link}; inline-size: var(--gh-size-4_5); block-size: var(--gh-size-4_5); }
  h1, h2 { margin: 0; font-size: var(--gh-font-subheading); font-weight: var(--gh-weight-medium); line-height: var(--gh-leading-label); }
`;
export const AccountCardBody = styled.div`
  padding: var(--gh-spacing-4); display: grid; gap: var(--gh-spacing-4); min-inline-size: 0;
  p { margin: 0; }
`;
export const AccountNote = styled.p`
  font-size: var(--gh-font-secondary); line-height: var(--gh-leading-reading); color: ${({ theme }) => theme.color.mutedText};
`;
export const AccountError = styled.p`
  color: ${({ theme }) => theme.color.outcome.incorrect.text};
  font-size: var(--gh-font-body); overflow-wrap: anywhere;
`;
export const AccountActions = styled.div`
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--gh-spacing-1) var(--gh-spacing-3);
`;
export const AccountSessionInfo = styled.details`
  position: relative; color: ${({ theme }) => theme.color.link};
  > summary { display: grid; place-items: center; inline-size: var(--gh-size-11); min-block-size: var(--form-control-height); cursor: pointer; list-style: none; }
  > summary::-webkit-details-marker { display: none; }
  > summary:focus-visible { outline: var(--gh-stroke-strong) solid ${({ theme }) => theme.color.focus}; outline-offset: var(--gh-size-0_5); }
  > summary svg { inline-size: var(--gh-size-4_5); block-size: var(--gh-size-4_5); }
  > p { position: absolute; inset-inline-end: 0; inset-block-start: 100%; z-index: var(--gh-layer-raised); inline-size: var(--gh-size-56); max-inline-size: 70vw;
    padding: var(--gh-spacing-2_5) var(--gh-spacing-3); border: 0; background: ${({ theme }) => theme.color.surface};
    border-radius: ${({ theme }) => theme.radius.surface};
    color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-secondary); }
`;
export const AccountSupport = styled.nav`
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: center; gap: var(--gh-spacing-2);
  border-block-start: 0; padding-block-start: var(--gh-spacing-2);
  > * { min-inline-size: 0; }
  form { margin: 0; }
  a, button { display: flex; align-items: center; min-block-size: var(--form-control-height); padding: var(--gh-spacing-1) 0; border: 0; background: transparent;
    border-radius: ${({ theme }) => theme.radius.none};
    color: ${({ theme }) => theme.color.link}; font-size: var(--gh-font-secondary); font-weight: var(--gh-weight-body); text-decoration: underline;
    text-underline-offset: var(--gh-size-0_75); white-space: normal; }
  > :last-child, > :last-child button { justify-content: flex-end; text-align: end; }
  > :last-child button { inline-size: 100%; }
`;
export const AccountCodeField = styled.div`
  input { text-align: center; font-size: var(--gh-font-page); letter-spacing: var(--gh-tracking-display); min-block-size: var(--form-control-height); }
`;
export const AccountSteps = styled.ol`
  display: flex; flex-wrap: wrap; gap: var(--gh-spacing-2_5);
  list-style: none; margin: 0; padding: 0; font-size: var(--gh-font-secondary);
  li { display: flex; align-items: center; gap: var(--gh-spacing-1_5); min-inline-size: 0; color: ${({ theme }) => theme.color.mutedText}; }
  li svg { inline-size: var(--gh-size-4); block-size: var(--gh-size-4); flex: none; }
  li[aria-current="step"] { color: ${({ theme }) => theme.color.link}; font-weight: var(--gh-weight-medium); }
`;
export const AccountPrimary = styled(Button)`width: 100%; font-weight: var(--gh-weight-medium);`;
export const AccountTextButton = styled(Button)`
  padding: var(--gh-spacing-1) 0; font-weight: var(--gh-weight-body); background: transparent;
`;
export const AccountPhone = styled.div`
  display: flex; align-items: center; gap: var(--gh-spacing-2_5); min-inline-size: 0;
  padding: var(--gh-spacing-2_5) var(--gh-spacing-3); background: ${({ theme }) => theme.color.surfaceMuted};
  border-radius: ${({ theme }) => theme.radius.control};
  > svg { inline-size: var(--gh-size-5); block-size: var(--gh-size-5); flex: none; color: ${({ theme }) => theme.color.link}; }
  small { display: block; color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-secondary); }
  strong { font-weight: var(--gh-weight-medium); overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
`;
