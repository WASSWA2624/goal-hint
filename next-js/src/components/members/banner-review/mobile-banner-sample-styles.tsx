"use client";

import styled from "styled-components";

export const MobileSample = styled.div`
  container-type: inline-size;
  color: ${({ theme }) => theme.header.text};
  background: ${({ theme }) => theme.header.background};
  font-size: 13px;
  line-height: 1.5;
  button { box-sizing: border-box; border-radius: 0; font: inherit; cursor: pointer; }
  button:focus-visible { outline: 2px solid ${({ theme }) => theme.header.accent}; outline-offset: 2px; }
`;

export const MobileHeader = styled.header`
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 4px;
  block-size: 48px;
  padding-inline: 8px;
  background: ${({ theme }) => theme.header.background};
  border-block-end: 1px solid ${({ theme }) => theme.header.border};
  button { display: inline-flex; align-items: center; justify-content: center; flex: none; gap: 3px; min-inline-size: 44px; block-size: 44px; padding: 4px 6px; border: 0; color: inherit; background: transparent; white-space: nowrap; font-size: 12px; }
  button:focus-visible { outline-offset: -2px; }
  [data-mobile-home] { min-inline-size: 0; padding: 0; }
  [data-mobile-header-actions] { display: flex; align-items: center; gap: 2px; margin-inline-start: auto; }
  [data-mobile-header-primary] { background: ${({ theme }) => theme.header.accent}; color: ${({ theme }) => theme.header.onAccent}; }
  [data-mobile-header-icon] { padding-inline: 4px; }
  svg { flex: none; font-size: 18px; }
  [data-mobile-sign-up-icon] { display: none; }
  @container (max-width: 359px) {
    [data-mobile-sign-up-text] { display: none; }
    [data-mobile-sign-up-icon] { display: inline-flex; }
  }
`;

export const MobileMessage = styled.div`
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 8px;
  min-block-size: 44px;
  padding: 0 12px;
  margin: 0;
  border-block-end: 1px solid ${({ theme }) => theme.header.border};
  background: ${({ theme }) => theme.header.navigationBackground};
  font-size: 13px;
  line-height: 1.5;
  strong { font-weight: 600; }
  [data-mobile-access] { min-inline-size: 0; }
  [data-mobile-price] { color: ${({ theme }) => theme.header.accent}; font-weight: 600; }
  [data-mobile-auth] { display: inline-flex; align-items: center; gap: 5px; }
  [data-mobile-auth] > span { color: ${({ theme }) => theme.header.mutedText}; }
  [data-mobile-actions] { display: inline-flex; align-items: center; flex: none; margin-inline-start: auto; }
  [data-mobile-separator] { color: ${({ theme }) => theme.header.mutedText}; }
  [data-mobile-status-icon] { display: inline-flex; align-items: center; flex: none; color: ${({ theme }) => theme.header.tone.emerald}; font-size: 14px; }
  [data-mobile-link] { display: inline-flex; align-items: center; justify-content: center; flex: none; gap: 3px; min-block-size: 24px; padding: 0; border: 0; background: transparent; color: ${({ theme }) => theme.header.accent}; font-weight: 600; text-decoration: underline; text-underline-offset: 3px; }
  [data-mobile-link] > svg { font-size: 13px; flex: none; }
  [data-mobile-link]:hover { text-decoration-thickness: 2px; }
  [data-mobile-link="button"], [data-mobile-link="outline"] { min-block-size: 36px; padding: 4px 9px; text-decoration: none; }
  [data-mobile-link="button"] { color: ${({ theme }) => theme.header.onAccent}; background: ${({ theme }) => theme.header.accent}; }
  [data-mobile-link="outline"] { border: 1px solid ${({ theme }) => theme.header.controlBorder}; }
  [data-mobile-step-mark] { display: inline-grid; place-items: center; flex: none; inline-size: 18px; block-size: 18px; color: ${({ theme }) => theme.header.accent}; background: ${({ theme }) => theme.header.controlFill}; font-size: 12px; font-weight: 600; }
  [data-mobile-step-mark] > svg { font-size: 12px; }
  &[data-variant="inline"] { gap: 7px; }
  &[data-variant="stacked"] {
    [data-mobile-access] { font-weight: 600; }
    [data-mobile-price] { font-weight: 400; }
    [data-mobile-auth] { padding-inline-start: 9px; border-inline-start: 1px solid ${({ theme }) => theme.header.border}; }
  }
  &[data-variant="split"] {
    [data-mobile-actions] > [data-mobile-link="text"] { min-block-size: 32px; padding-inline: 8px; border: 1px solid ${({ theme }) => theme.header.controlBorder}; text-decoration: none; }
  }
  &[data-variant="rule"] {
    border-inline-start: 3px solid ${({ theme }) => theme.color.brand};
    padding-inline-start: 9px;
    color: ${({ theme }) => theme.color.text};
    background: ${({ theme }) => theme.color.brandSoft};
    [data-mobile-link], [data-mobile-price] { color: ${({ theme }) => theme.color.link}; }
    [data-mobile-auth] > span { color: ${({ theme }) => theme.color.mutedText}; }
  }
  &[data-variant="price"] {
    [data-mobile-price-anchor] { display: inline-flex; align-items: center; gap: 5px; }
    [data-mobile-price-anchor] strong { color: ${({ theme }) => theme.header.accent}; font-size: 14px; }
    [data-mobile-price-anchor] > span { font-size: 12px; color: ${({ theme }) => theme.header.mutedText}; }
    [data-mobile-price-anchor] > svg { font-size: 14px; color: ${({ theme }) => theme.header.tone.emerald}; }
  }
  &[data-variant="contrast"] {
    color: ${({ theme }) => theme.header.onAccent};
    background: ${({ theme }) => theme.header.accent};
    border-block-end-color: ${({ theme }) => theme.header.accent};
    [data-mobile-link], [data-mobile-price], [data-mobile-auth] > span { color: inherit; }
    [data-mobile-link="button"] { color: ${({ theme }) => theme.header.accent}; background: ${({ theme }) => theme.header.onAccent}; }
    button:focus-visible { outline-color: ${({ theme }) => theme.header.onAccent}; }
  }
  &[data-variant="editorial"] {
    gap: 7px;
    [data-mobile-kicker] { padding-inline-end: 7px; border-inline-end: 1px solid ${({ theme }) => theme.header.border}; font-size: 12px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; }
    [data-mobile-link], [data-mobile-price] { color: inherit; }
  }
  &[data-variant="steps"] {
    gap: 6px;
  }
  &[data-variant="edge"] {
    padding-inline-end: 0;
    [data-mobile-edge-actions] { display: inline-flex; flex: none; align-items: center; align-self: stretch; margin-inline-start: auto; padding-inline: 9px; border-inline-start: 1px solid ${({ theme }) => theme.header.border}; background: ${({ theme }) => theme.header.controlFill}; }
  }
  &[data-variant="quiet"] {
    gap: 6px;
    color: ${({ theme }) => theme.header.mutedText};
    [data-mobile-status-icon] { font-size: 14px; }
    [data-mobile-link] { font-weight: 500; }
  }
`;
