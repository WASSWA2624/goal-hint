"use client";

import styled from "styled-components";

export const Sample = styled.div`
  container-type: inline-size;
  color: ${({ theme }) => theme.header.text};
  background: ${({ theme }) => theme.header.background};
  font-size: 13px;
  line-height: 1.5;
  button { font: inherit; border-radius: 0; cursor: pointer; }
  button:focus-visible { outline: 2px solid ${({ theme }) => theme.color.focus}; outline-offset: 2px; }
`;

export const PreviewHeader = styled.header`
  display: flex;
  align-items: center;
  gap: 20px;
  block-size: 48px;
  padding-inline: 20px;
  background: ${({ theme }) => theme.header.background};
  border-block-end: 1px solid ${({ theme }) => theme.header.border};
  [data-home] { flex: none; padding: 0; border: 0; background: transparent; }
  nav { display: flex; align-items: stretch; align-self: stretch; gap: 2px; flex: 1; }
  nav button { display: inline-flex; align-items: center; gap: 5px; padding: 0 9px; border: 0; border-block-end: 2px solid transparent; background: transparent; color: ${({ theme }) => theme.header.mutedText}; white-space: nowrap; }
  nav button[aria-current="page"] { color: ${({ theme }) => theme.header.accent}; border-block-end-color: ${({ theme }) => theme.header.accent}; }
  svg { flex: none; font-size: 16px; }
  [data-utilities] { display: flex; align-items: center; gap: 6px; margin-inline-start: auto; }
  [data-utilities] button { display: inline-flex; align-items: center; justify-content: center; gap: 5px; min-block-size: 32px; min-inline-size: 32px; padding: 4px 7px; border: 0; background: transparent; color: inherit; white-space: nowrap; }
  [data-utilities] [data-primary] { color: ${({ theme }) => theme.header.onAccent}; background: ${({ theme }) => theme.header.accent}; }
  @container (max-width: 1100px) { [data-secondary-nav] { display: none; } }
`;

export const BannerRow = styled.div<{ $height: number }>`
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 12px;
  min-block-size: ${({ $height }) => $height}px;
  padding: 5px 20px;
  margin: 0;
  border-block-end: 1px solid ${({ theme }) => theme.header.border};
  background: ${({ theme }) => theme.header.background};
  font-size: 13px;
  line-height: 1.5;
  [data-copy] { min-inline-size: 0; }
  [data-grow] { flex: 1; }
  [data-muted] { color: ${({ theme }) => theme.header.mutedText}; }
  [data-price] { color: ${({ theme }) => theme.header.accent}; white-space: nowrap; font-weight: 600; }
  [data-kicker] { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; white-space: nowrap; }
  [data-icon] { display: inline-flex; flex: none; color: ${({ theme }) => theme.header.accent}; font-size: 16px; }
  [data-active-icon] { color: ${({ theme }) => theme.header.tone.emerald}; }
  [data-actions] { display: flex; align-items: center; gap: 6px; margin-inline-start: auto; white-space: nowrap; }
  [data-link] { display: inline-flex; align-items: center; gap: 3px; min-block-size: 24px; padding: 0; border: 0; background: transparent; color: ${({ theme }) => theme.header.accent}; font-weight: 600; text-decoration: underline; text-underline-offset: 3px; }
  [data-link] svg { font-size: 14px; }
  [data-link]:hover { text-decoration-thickness: 2px; }
  [data-link="button"] { min-block-size: 28px; padding: 2px 11px; text-decoration: none; background: ${({ theme }) => theme.header.accent}; color: ${({ theme }) => theme.header.onAccent}; }
  [data-inline-tail] { margin-inline-start: auto; }
  &[data-variant="inline"] { gap: 9px; }
  &[data-variant="split"] {
    color: ${({ theme }) => theme.color.text};
    background: ${({ theme }) => theme.color.brandSoft};
    [data-muted] { color: ${({ theme }) => theme.color.mutedText}; }
    [data-link], [data-price] { color: ${({ theme }) => theme.color.link}; }
    [data-active-icon] { color: ${({ theme }) => theme.color.accent.emerald.text}; }
    [data-link="button"] { color: ${({ theme }) => theme.color.onBrand}; background: ${({ theme }) => theme.color.brand}; }
  }
  &[data-variant="centered"] { justify-content: center; text-align: center; }
  &[data-variant="rule"] {
    padding-inline-start: 17px;
    border-inline-start: 3px solid ${({ theme }) => theme.header.accent};
    [data-kicker] { color: ${({ theme }) => theme.header.accent}; }
  }
  &[data-variant="price"] {
    padding-block: 0;
    [data-price-anchor] { display: flex; align-items: center; align-self: stretch; gap: 6px; padding-inline-end: 18px; margin-inline-end: 4px; border-inline-end: 1px solid ${({ theme }) => theme.header.border}; white-space: nowrap; }
    [data-price-anchor] strong { color: ${({ theme }) => theme.header.accent}; font-size: 16px; font-weight: 700; }
    [data-price-anchor] small { font-size: 11px; color: ${({ theme }) => theme.header.mutedText}; }
  }
  &[data-variant="editorial"] {
    gap: 22px;
    [data-kicker] { padding-inline-end: 20px; border-inline-end: 1px solid ${({ theme }) => theme.header.border}; }
    [data-link], [data-price] { color: inherit; }
  }
  &[data-variant="contrast"] {
    color: ${({ theme }) => theme.header.onAccent};
    background: ${({ theme }) => theme.header.accent};
    border-block-end-color: ${({ theme }) => theme.header.accent};
    [data-link], [data-price], [data-icon], [data-muted] { color: inherit; }
    [data-link="button"] { color: ${({ theme }) => theme.header.accent}; background: ${({ theme }) => theme.header.onAccent}; }
    button:focus-visible { outline-color: ${({ theme }) => theme.header.onAccent}; }
  }
  &[data-variant="stacked"] {
    [data-copy] { display: grid; gap: 0; }
    [data-kicker] { font-size: 11px; color: ${({ theme }) => theme.header.mutedText}; }
  }
  &[data-variant="journey"] {
    gap: 20px;
    [data-step] { display: inline-flex; align-items: center; gap: 7px; white-space: nowrap; }
    [data-step-number] { display: inline-grid; place-items: center; block-size: 20px; inline-size: 20px; color: ${({ theme }) => theme.header.accent}; background: ${({ theme }) => theme.color.brandSoft}; font-size: 11px; font-weight: 600; }
    [data-step-number] svg { font-size: 13px; }
    [data-step-arrow] { flex: none; color: ${({ theme }) => theme.header.mutedText}; font-size: 13px; }
  }
  &[data-variant="quiet"] {
    gap: 9px;
    color: ${({ theme }) => theme.header.mutedText};
    [data-icon] { font-size: 13px; }
    [data-link] { font-weight: 500; }
  }
`;
