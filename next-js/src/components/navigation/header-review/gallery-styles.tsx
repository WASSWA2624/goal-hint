"use client";

import styled from "styled-components";

export const Review = styled.main`
  min-block-size: 100dvh; padding: 32px clamp(12px, 3vw, 48px) 48px;
  color: ${({ theme }) => theme.color.text}; background: ${({ theme }) => theme.color.page};
  font-size: 14px;
  button, select { font: inherit; border-radius: 0; }
  :is(button, select, a):focus-visible { outline: 2px solid ${({ theme }) => theme.color.focus}; outline-offset: 3px; }
`;
export const Content = styled.div`max-inline-size: 1320px; margin-inline: auto; min-inline-size: 0;`;
export const Intro = styled.header`
  display: grid; gap: 10px;
  > span { color: ${({ theme }) => theme.color.link}; font-size: 11px; text-transform: uppercase; letter-spacing: 0.14em; font-weight: 700; }
  h1 { font-size: clamp(24px, 3vw, 34px); line-height: 1.2; letter-spacing: -0.025em; }
  > p { max-inline-size: 850px; color: ${({ theme }) => theme.color.mutedText}; line-height: 1.7; }
`;
export const Toolbar = styled.div`
  display: flex; flex-wrap: wrap; align-items: end; gap: 12px; margin-block: 24px 12px; padding-block: 16px;
  border-block: 1px solid ${({ theme }) => theme.color.border};
  label { display: grid; gap: 5px; min-inline-size: 0; }
  label > span { font-size: 11px; font-weight: 600; color: ${({ theme }) => theme.color.mutedText}; }
  select, button { min-block-size: 44px; padding: 8px 12px; color: ${({ theme }) => theme.color.text};
    background: ${({ theme }) => theme.color.surface}; border: 1px solid ${({ theme }) => theme.color.controlBorder}; cursor: pointer; }
  button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
  button > svg { font-size: 16px; }
  @media (max-width: 430px) { label { flex: 1 1 40%; } select { inline-size: 100%; } }
`;
export const Status = styled.p`
  min-block-size: 24px; margin-block-end: 24px; color: ${({ theme }) => theme.color.mutedText}; font-size: 12px;
`;
export const Gallery = styled.div`display: grid; gap: 32px;`;
export const Option = styled.section`
  min-inline-size: 0; scroll-margin-block-start: 20px;
  > header { display: flex; align-items: start; gap: 12px; margin-block-end: 12px; }
  [data-number] { font-size: 24px; line-height: 1.1; font-weight: 700; color: ${({ theme }) => theme.color.link}; }
  h2 { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; font-size: 17px; line-height: 1.4; }
  [data-recommended] { padding: 3px 6px; color: ${({ theme }) => theme.color.link}; background: ${({ theme }) => theme.color.brandSoft}; font-size: 10px; letter-spacing: 0.02em; font-weight: 600; }
  header p { margin-block-start: 3px; color: ${({ theme }) => theme.color.mutedText}; font-size: 12px; line-height: 1.5; }
`;
export const Label = styled.div`
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 4px 12px;
  margin-block-end: 7px; font-size: 11px; color: ${({ theme }) => theme.color.mutedText};
  > strong { font-weight: 600; color: ${({ theme }) => theme.color.text}; }
`;
export const Viewport = styled.div`
  min-inline-size: 0; max-inline-size: 100%; overflow-x: auto;
  border: 1px solid ${({ theme }) => theme.color.border};
  scrollbar-width: thin;
  &:has(details[open]) { padding-block-end: 240px; }
`;
export const Canvas = styled.div<{ $width: number }>`inline-size: ${({ $width }) => $width}px;`;
export const MobileRow = styled.div`
  display: grid; grid-template-columns: minmax(0, 430px) 1fr; align-items: start; gap: 24px; margin-block-start: 16px;
  @media (max-width: 760px) { grid-template-columns: minmax(0, 1fr); gap: 10px; }
`;
export const Spec = styled.dl`
  display: flex; flex-wrap: wrap; gap: 12px 28px; padding-block-start: 22px; font-size: 12px;
  > div { display: grid; gap: 4px; }
  dt { color: ${({ theme }) => theme.color.mutedText}; }
  dd { font-weight: 600; }
  @media (max-width: 760px) { padding-block-start: 0; font-size: 11px; }
`;
export const Footer = styled.footer`
  margin-block-start: 32px; padding-block-start: 18px; border-block-start: 1px solid ${({ theme }) => theme.color.border};
  font-size: 12px; color: ${({ theme }) => theme.color.mutedText};
  a { color: ${({ theme }) => theme.color.link}; }
`;
