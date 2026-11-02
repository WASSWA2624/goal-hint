"use client";

import styled, { css } from "styled-components";
import { Button, TextLink } from "@/components/ui/controls";

const accountLinkAction = css`
  display: inline-flex; align-items: center; justify-content: center; gap: var(--gh-spacing-1_5);
  min-block-size: var(--form-control-height); max-inline-size: 100%;
  color: ${({ theme }) => theme.color.link}; font-size: var(--gh-font-emphasis); font-weight: var(--gh-weight-medium);
  text-align: center; white-space: normal; text-decoration: underline; text-underline-offset: var(--gh-size-0_75);
  background: transparent; border: 0;
  &:hover:not(:disabled), &:active { background: transparent; border: 0; }
  &:disabled { color: ${({ theme }) => theme.color.disabledText}; }
`;
export const AccountLink = styled(TextLink)`${accountLinkAction}`;

/** All authentication steps share one readable column within the app shell. */
export const AccountCard = styled.section`
  inline-size: 100%; max-inline-size: ${({ theme }) => theme.layout.formMaxWidth}; min-inline-size: 0; margin-inline: auto;
  background: ${({ theme }) => theme.color.surface};
  border: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.control};
  font-size: var(--gh-font-emphasis); line-height: var(--gh-leading-reading);
  h2 { font-size: var(--gh-font-section); font-weight: var(--gh-weight-medium); margin: 0 0 var(--gh-spacing-3); }
`;
export const AccountCardHeading = styled.div`
  background: ${({ theme }) => theme.color.section};
  display: flex; align-items: flex-start; gap: var(--gh-spacing-3);
  padding: var(--gh-spacing-5);
  border-block-end: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border};
  border-start-start-radius: inherit; border-start-end-radius: inherit;
  > svg { flex: none; color: ${({ theme }) => theme.color.link}; background: ${({ theme }) => theme.color.brandSoft};
    inline-size: var(--gh-size-10); block-size: var(--gh-size-10); padding: var(--gh-spacing-2_5); border-radius: ${({ theme }) => theme.radius.control}; }
  > div { display: grid; flex: 1; gap: var(--gh-spacing-1_5); min-inline-size: 0; }
  h1, h2 { margin: 0; font-size: var(--gh-font-heading); font-weight: var(--gh-weight-semibold); line-height: var(--gh-leading-heading); }
  p { margin: 0; color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-secondary); line-height: var(--gh-leading-reading); }
`;
export const AccountCardBody = styled.div`
  padding: var(--gh-spacing-5); display: grid; gap: var(--gh-spacing-4); min-inline-size: 0;
  > form { gap: var(--gh-spacing-4); }
  p { margin: 0; }
`;
export const AccountFormFooter = styled.div`
  display: grid; gap: var(--gh-spacing-3); min-inline-size: 0;
  padding-block-start: var(--gh-spacing-4); border-block-start: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border};
  > p { text-align: center; }
`;
export const AccountSecondaryActions = styled.nav`
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;
  gap: var(--gh-spacing-1) var(--gh-spacing-4); min-inline-size: 0;
  > * { min-inline-size: 0; }
  > :only-child { margin-inline: auto; }
  form { margin: 0; }
  > form > button { ${accountLinkAction} }
`;
export const AccountFormColumn = styled.div`
  inline-size: 100%; max-inline-size: ${({ theme }) => theme.layout.formMaxWidth}; min-inline-size: 0;
  display: grid; gap: var(--gh-spacing-4);
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
  display: grid; gap: var(--gh-spacing-3);
  border-block-start: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border}; padding-block-start: var(--gh-spacing-4);
  > * { min-inline-size: 0; }
  form { margin: 0; }
  > form > button { inline-size: 100%; ${accountLinkAction} }
`;
export const AccountCodeField = styled.div`
  input { text-align: center; font-size: var(--gh-font-page); letter-spacing: var(--gh-tracking-display); min-block-size: var(--form-control-height); }
`;
export const AccountSteps = styled.ol`
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--gh-spacing-2);
  list-style: none; margin: 0; padding: 0; font-size: var(--gh-font-secondary);
  li { display: flex; align-items: center; gap: var(--gh-spacing-1_5); min-inline-size: 0; padding-block: var(--gh-spacing-2);
    border-block-end: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border}; color: ${({ theme }) => theme.color.mutedText}; }
  li svg { inline-size: var(--gh-size-4); block-size: var(--gh-size-4); flex: none; }
  li[aria-current="step"] { color: ${({ theme }) => theme.color.link}; border-color: currentColor; font-weight: var(--gh-weight-medium); }
`;
export const AccountPrimary = styled(Button)`
  width: 100%; font-weight: var(--gh-weight-medium);
  &&:disabled { background: ${({ theme }) => theme.color.brandSoft}; color: ${({ theme }) => theme.color.disabledText}; }
`;
export const AccountTextButton = styled(Button)`
  && { padding-inline: 0; ${accountLinkAction} }
`;
export const AccountPhone = styled.div`
  display: flex; align-items: center; gap: var(--gh-spacing-2_5); min-inline-size: 0;
  padding: var(--gh-spacing-2_5) var(--gh-spacing-3); background: ${({ theme }) => theme.color.surfaceMuted};
  border-radius: ${({ theme }) => theme.radius.control};
  > svg { inline-size: var(--gh-size-5); block-size: var(--gh-size-5); flex: none; color: ${({ theme }) => theme.color.link}; }
  small { display: block; color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-secondary); }
  strong { font-weight: var(--gh-weight-medium); overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
`;
