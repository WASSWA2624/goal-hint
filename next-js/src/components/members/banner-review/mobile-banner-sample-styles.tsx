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
  padding: 6px 12px;
  margin: 0;
  border-block-end: 1px solid ${({ theme }) => theme.header.border};
  background: ${({ theme }) => theme.header.navigationBackground};
  font-size: 13px;
  line-height: 1.5;
  p { margin: 0; }
  strong { font-weight: 600; }
  [data-mobile-copy] { flex: 1; min-inline-size: 0; }
  [data-mobile-muted] { color: ${({ theme }) => theme.header.mutedText}; }
  [data-mobile-price] { color: ${({ theme }) => theme.header.accent}; font-weight: 600; white-space: nowrap; }
  [data-mobile-status-icon] { display: inline-flex; align-self: flex-start; flex: none; margin-block-start: 4px; color: ${({ theme }) => theme.header.accent}; font-size: 16px; }
  [data-mobile-status-icon="active"] { color: ${({ theme }) => theme.header.tone.emerald}; }
  [data-mobile-link] { display: inline-flex; align-items: center; justify-content: center; gap: 3px; min-block-size: 24px; padding: 0; border: 0; background: transparent; color: ${({ theme }) => theme.header.accent}; font-weight: 600; white-space: nowrap; text-decoration: underline; text-underline-offset: 3px; }
  [data-mobile-link] > svg { font-size: 13px; flex: none; }
  [data-mobile-link]:hover { text-decoration-thickness: 2px; }
  [data-mobile-link="button"], [data-mobile-link="outline"] { min-block-size: 36px; padding: 4px 9px; text-decoration: none; }
  [data-mobile-link="button"] { color: ${({ theme }) => theme.header.onAccent}; background: ${({ theme }) => theme.header.accent}; }
  [data-mobile-link="outline"] { border: 1px solid ${({ theme }) => theme.header.controlBorder}; }
  [data-mobile-action-column] { flex: none; display: grid; align-content: center; justify-items: stretch; gap: 2px; }
  [data-mobile-caption] { display: block; font-size: 12px; color: ${({ theme }) => theme.header.mutedText}; }
  [data-mobile-inline-actions] { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; }
  [data-mobile-title] { display: block; }

  &[data-variant="inline"] { align-items: flex-start; }
  &[data-variant="stacked"] {
    display: block;
    padding-block: 7px;
    [data-mobile-title] { margin-block-end: 2px; }
    [data-mobile-inline-actions] { gap: 3px 8px; }
  }
  &[data-variant="split"] {
    padding-block: 6px;
    [data-mobile-status-icon] { align-self: center; margin: 0; }
    [data-mobile-action-column] { min-inline-size: 66px; }
    [data-mobile-action-column] [data-mobile-link="text"] { min-block-size: 28px; }
  }
  &[data-variant="rule"] {
    border-inline-start: 3px solid ${({ theme }) => theme.color.brand};
    padding-inline-start: 9px;
    color: ${({ theme }) => theme.color.text};
    background: ${({ theme }) => theme.color.brandSoft};
    [data-mobile-caption] { color: ${({ theme }) => theme.color.mutedText}; }
    [data-mobile-link], [data-mobile-price] { color: ${({ theme }) => theme.color.link}; }
  }
  &[data-variant="price"] {
    gap: 12px;
    [data-mobile-price-anchor] { display: grid; flex: none; align-self: stretch; align-content: center; gap: 1px; min-inline-size: 88px; padding-inline-end: 12px; border-inline-end: 1px solid ${({ theme }) => theme.header.border}; }
    [data-mobile-price-anchor] strong { color: ${({ theme }) => theme.header.accent}; font-size: 16px; }
    [data-mobile-price-anchor] > span { font-size: 12px; color: ${({ theme }) => theme.header.mutedText}; }
    [data-mobile-price-anchor] [data-mobile-status-icon] { margin: 0; }
  }
  &[data-variant="contrast"] {
    display: block;
    padding-block: 7px;
    color: ${({ theme }) => theme.header.onAccent};
    background: ${({ theme }) => theme.header.accent};
    border-block-end-color: ${({ theme }) => theme.header.accent};
    [data-mobile-link], [data-mobile-price], [data-mobile-muted], [data-mobile-caption] { color: inherit; }
    [data-mobile-link="button"] { color: ${({ theme }) => theme.header.accent}; background: ${({ theme }) => theme.header.onAccent}; }
    [data-mobile-inline-actions] { justify-content: space-between; gap: 3px 10px; }
    button:focus-visible { outline-color: currentColor; }
  }
  &[data-variant="editorial"] {
    display: block;
    [data-mobile-editorial-head] { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-block-end: 2px; }
    [data-mobile-editorial-head] > strong { font-size: 12px; letter-spacing: 0.06em; text-transform: uppercase; }
    [data-mobile-link] { color: inherit; }
  }
  &[data-variant="steps"] {
    display: grid;
    gap: 4px;
    [data-mobile-steps] { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
    [data-mobile-step] { display: inline-flex; align-items: center; gap: 4px; color: ${({ theme }) => theme.header.mutedText}; font-size: 12px; }
    [data-mobile-step="current"] { color: ${({ theme }) => theme.header.accent}; font-weight: 600; }
    [data-mobile-step-mark] { display: inline-grid; place-items: center; inline-size: 18px; block-size: 18px; background: ${({ theme }) => theme.header.controlFill}; color: inherit; font-size: 12px; }
    [data-mobile-step-mark] > svg { font-size: 12px; }
    [data-mobile-step-arrow] { font-size: 12px; color: ${({ theme }) => theme.header.mutedText}; }
  }
  &[data-variant="edge"] {
    padding-block: 0;
    padding-inline-end: 0;
    gap: 12px;
    [data-mobile-copy] { padding-block: 8px; }
    [data-mobile-edge-actions] { display: grid; flex: none; align-content: center; justify-items: stretch; align-self: stretch; gap: 0; min-inline-size: 82px; padding: 3px 6px; border-inline-start: 1px solid ${({ theme }) => theme.header.border}; background: ${({ theme }) => theme.header.controlFill}; }
    [data-mobile-edge-actions] [data-mobile-link] { min-block-size: 30px; }
  }
  &[data-variant="quiet"] {
    min-block-size: 44px;
    padding-block: 4px;
    gap: 6px;
    color: ${({ theme }) => theme.header.mutedText};
    [data-mobile-status-icon] { font-size: 14px; }
    [data-mobile-link] { font-weight: 500; }
  }
`;
