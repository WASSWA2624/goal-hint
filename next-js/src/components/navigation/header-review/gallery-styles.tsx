"use client";

import styled from "styled-components";

export const Review = styled.main`
  min-block-size: 100dvh; padding: var(--gh-spacing-8) clamp(var(--gh-spacing-3), 3vw, var(--gh-spacing-12)) var(--gh-spacing-12);
  color: ${({ theme }) => theme.color.text}; background: ${({ theme }) => theme.color.page};
  font-size: var(--gh-font-emphasis);
  button, select { font: inherit; }
  :is(button, select, a):focus-visible { outline: var(--gh-stroke-strong) solid ${({ theme }) => theme.color.focus}; outline-offset: var(--gh-size-0_75); }
`;
export const Content = styled.div`max-inline-size: var(--gh-size-330); margin-inline: auto; min-inline-size: 0;`;
export const Intro = styled.header`
  display: grid; gap: var(--gh-spacing-2_5);
  > span { color: ${({ theme }) => theme.color.link}; font-size: var(--gh-font-caption); text-transform: uppercase; letter-spacing: var(--gh-tracking-display); font-weight: var(--gh-weight-bold); }
  h1 { font-size: clamp(var(--gh-font-headline), 3vw, var(--gh-font-displayLarge)); line-height: var(--gh-leading-control); letter-spacing: var(--gh-tracking-tighter); }
  > p { max-inline-size: var(--gh-size-212_5); color: ${({ theme }) => theme.color.mutedText}; line-height: var(--gh-leading-prose); }
`;
export const Toolbar = styled.div`
  display: flex; flex-wrap: wrap; align-items: end; gap: var(--gh-spacing-3); margin-block: var(--gh-spacing-6) var(--gh-spacing-3); padding-block: var(--gh-spacing-4);
  border-block: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border};
  label { display: grid; gap: var(--gh-spacing-1_25); min-inline-size: 0; }
  label > span { font-size: var(--gh-font-caption); font-weight: var(--gh-weight-semibold); color: ${({ theme }) => theme.color.mutedText}; }
  select, button { min-block-size: var(--gh-size-11); padding: var(--gh-spacing-2) var(--gh-spacing-3); color: ${({ theme }) => theme.color.text};
    background: ${({ theme }) => theme.color.surface}; border: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.controlBorder}; cursor: pointer; }
  button { display: inline-flex; align-items: center; justify-content: center; gap: var(--gh-spacing-1_5); }
  button > svg { font-size: var(--gh-font-section); }
  @media (max-width: ${({ theme }) => theme.viewport[26.875]}) { label { flex: 1 1 40%; } select { inline-size: 100%; } }
`;
export const Status = styled.p`
  min-block-size: var(--gh-size-6); margin-block-end: var(--gh-spacing-6); color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-secondary);
`;
export const Gallery = styled.div`display: grid; gap: var(--gh-spacing-8);`;
export const Option = styled.section`
  min-inline-size: 0; scroll-margin-block-start: var(--gh-spacing-5);
  > header { display: flex; align-items: start; gap: var(--gh-spacing-3); margin-block-end: var(--gh-spacing-3); }
  [data-number] { font-size: var(--gh-font-headline); line-height: var(--gh-leading-tight); font-weight: var(--gh-weight-bold); color: ${({ theme }) => theme.color.link}; }
  h2 { display: flex; flex-wrap: wrap; align-items: center; gap: var(--gh-spacing-2_5); font-size: var(--gh-font-subheading); line-height: var(--gh-leading-compact); }
  [data-recommended] { padding: var(--gh-spacing-0_75) var(--gh-spacing-1_5); color: ${({ theme }) => theme.color.link}; background: ${({ theme }) => theme.color.brandSoft}; font-size: var(--gh-font-micro); letter-spacing: var(--gh-tracking-relaxed); font-weight: var(--gh-weight-semibold); }
  header p { margin-block-start: var(--gh-spacing-0_75); color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-secondary); line-height: var(--gh-leading-normal); }
`;
export const Label = styled.div`
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--gh-spacing-1) var(--gh-spacing-3);
  margin-block-end: var(--gh-spacing-1_75); font-size: var(--gh-font-caption); color: ${({ theme }) => theme.color.mutedText};
  > strong { font-weight: var(--gh-weight-semibold); color: ${({ theme }) => theme.color.text}; }
`;
export const Viewport = styled.div`
  min-inline-size: 0; max-inline-size: 100%; overflow-x: auto;
  border: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border};
  scrollbar-width: thin;
  &:has(details[open]) { padding-block-end: var(--gh-spacing-60); }
`;
export const Canvas = styled.div<{ $width: number }>`inline-size: ${({ $width }) => $width}px;`;
export const MobileRow = styled.div`
  display: grid; grid-template-columns: minmax(0, var(--gh-size-107_5)) 1fr; align-items: start; gap: var(--gh-spacing-6); margin-block-start: var(--gh-spacing-4);
  @media (max-width: ${({ theme }) => theme.viewport[47.5]}) { grid-template-columns: minmax(0, 1fr); gap: var(--gh-spacing-2_5); }
`;
export const Spec = styled.dl`
  display: flex; flex-wrap: wrap; gap: var(--gh-spacing-3) var(--gh-spacing-7); padding-block-start: var(--gh-spacing-5_5); font-size: var(--gh-font-secondary);
  > div { display: grid; gap: var(--gh-spacing-1); }
  dt { color: ${({ theme }) => theme.color.mutedText}; }
  dd { font-weight: var(--gh-weight-semibold); }
  @media (max-width: ${({ theme }) => theme.viewport[47.5]}) { padding-block-start: 0; font-size: var(--gh-font-caption); }
`;
export const Footer = styled.footer`
  margin-block-start: var(--gh-spacing-8); padding-block-start: var(--gh-spacing-4_5); border-block-start: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border};
  font-size: var(--gh-font-secondary); color: ${({ theme }) => theme.color.mutedText};
  a { color: ${({ theme }) => theme.color.link}; }
`;
