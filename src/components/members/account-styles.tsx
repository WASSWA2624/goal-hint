"use client";

import styled from "styled-components";
import { Button } from "@/components/ui/controls";

/** The same compact, square account surface on phones and desktop. */
export const AccountCard = styled.section`
  inline-size: 100%; max-inline-size: 26rem; min-inline-size: 0; margin-inline: auto;
  background: ${({ theme }) => theme.color.surface};
  border: 1px solid ${({ theme }) => theme.color.border};
  font-size: 0.875rem; line-height: 1.45;
  button, a { min-block-size: 44px; }
  input { min-block-size: 48px; font-size: 16px; border-radius: 0; }
  button { border-radius: 0; font-size: 0.875rem; }
  h2 { font-size: 1rem; font-weight: 500; margin: 0 0 12px; }
`;
export const AccountCardHeading = styled.div`
  display: flex; align-items: center; gap: 10px;
  min-block-size: 58px; padding: 10px 16px;
  border-block-end: 1px solid ${({ theme }) => theme.color.border};
  > svg { color: ${({ theme }) => theme.color.link}; inline-size: 18px; block-size: 18px; }
  h1, h2 { margin: 0; font-size: 1.0625rem; font-weight: 500; line-height: 1.3; }
`;
export const AccountCardBody = styled.div`
  padding: 16px; display: grid; gap: 16px; min-inline-size: 0;
  p { margin: 0; }
`;
export const AccountNote = styled.p`
  font-size: 0.75rem; line-height: 1.45; color: ${({ theme }) => theme.color.mutedText};
`;
export const AccountError = styled.p`
  color: ${({ theme }) => theme.color.outcome.incorrect.text};
  font-size: 0.8125rem; overflow-wrap: anywhere;
`;
export const AccountActions = styled.div`
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 4px 12px;
`;
export const AccountSingleDeviceInfo = styled.details`
  position: relative; color: ${({ theme }) => theme.color.link};
  > summary { display: grid; place-items: center; inline-size: 44px; min-block-size: 44px; cursor: pointer; list-style: none; }
  > summary::-webkit-details-marker { display: none; }
  > summary:focus-visible { outline: 2px solid ${({ theme }) => theme.color.focus}; outline-offset: 2px; }
  > summary svg { inline-size: 18px; block-size: 18px; }
  > p { position: absolute; inset-inline-end: 0; inset-block-start: 100%; z-index: 2; inline-size: 14rem; max-inline-size: 70vw;
    padding: 10px 12px; border: 1px solid ${({ theme }) => theme.color.border}; background: ${({ theme }) => theme.color.surface};
    color: ${({ theme }) => theme.color.mutedText}; font-size: 0.75rem; }
`;
export const AccountSupport = styled.nav`
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: center; gap: 8px;
  border-block-start: 1px solid ${({ theme }) => theme.color.border}; padding-block-start: 8px;
  > * { min-inline-size: 0; }
  form { margin: 0; }
  a, button { display: flex; align-items: center; min-block-size: 44px; padding: 4px 0; border: 0; background: transparent;
    color: ${({ theme }) => theme.color.link}; font-size: 0.75rem; font-weight: 400; text-decoration: underline;
    text-underline-offset: 3px; white-space: normal; }
  > :last-child, > :last-child button { justify-content: flex-end; text-align: end; }
  > :last-child button { inline-size: 100%; }
`;
export const AccountCodeField = styled.div`
  input { text-align: center; font-size: 1.375rem; letter-spacing: 0.28em; min-block-size: 60px; }
`;
export const AccountSteps = styled.ol`
  display: flex; flex-wrap: wrap; gap: 10px;
  list-style: none; margin: 0; padding: 0; font-size: 0.75rem;
  li { display: flex; align-items: center; gap: 6px; min-inline-size: 0; color: ${({ theme }) => theme.color.mutedText}; }
  li svg { inline-size: 16px; block-size: 16px; flex: none; }
  li[aria-current="step"] { color: ${({ theme }) => theme.color.link}; font-weight: 500; }
`;
export const AccountPrimary = styled(Button)`width: 100%; font-weight: 500;`;
export const AccountTextButton = styled(Button)`
  padding: 4px 0; font-weight: 400; background: transparent;
`;
export const AccountPhone = styled.div`
  display: flex; align-items: center; gap: 10px; min-inline-size: 0;
  padding: 10px 12px; background: ${({ theme }) => theme.color.surfaceMuted};
  > svg { inline-size: 20px; block-size: 20px; flex: none; color: ${({ theme }) => theme.color.link}; }
  small { display: block; color: ${({ theme }) => theme.color.mutedText}; font-size: 0.75rem; }
  strong { font-weight: 500; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
`;
export const AccountSection = styled.details`
  border-block-start: 1px solid ${({ theme }) => theme.color.border}; padding-block-start: 12px;
  > summary { min-block-size: 44px; display: flex; align-items: center; gap: 8px; cursor: pointer; list-style: none; }
  > summary::-webkit-details-marker { display: none; }
  > summary > svg { margin-inline-start: auto; }
  &[open] > summary > svg { transform: rotate(180deg); }
  > div { display: grid; gap: 12px; padding-block: 8px 12px; }
  h2 { font-size: 0.9375rem; }
`;
