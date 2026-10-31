"use client";

import styled from "styled-components";
import { media } from "@/styles/theme";
import { Button } from "@/components/ui/controls";

export const ShareTrigger = styled(Button)`
  && { min-block-size: 28px; min-inline-size: 0; padding: 3px 7px; gap: 5px; border-radius: ${({ theme }) => theme.radius.control};
    font-size: .75rem; line-height: 1.25; font-weight: ${({ theme }) => theme.typography.weight.medium}; }
  svg { inline-size: 14px; block-size: 14px; }
  @media (pointer: coarse) { && { min-block-size: 36px; } }
  &&[data-share-icon-only] { inline-size: 44px; min-inline-size: 44px; min-block-size: 44px; padding: 0; }
  &[data-share-icon-only] svg { inline-size: 18px; block-size: 18px; }
`;

export const Drawer = styled.dialog`
  position: fixed; inset-block: 0; inset-inline: auto 0;
  inline-size: min(22rem, 100vw); max-inline-size: 100vw; block-size: 100dvh; max-block-size: 100dvh;
  margin: 0 0 0 auto; padding: 0; border: 0; border-inline-start: 1px solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.none};
  border-start-start-radius: ${({ theme }) => theme.radius.overlay}; border-end-start-radius: ${({ theme }) => theme.radius.overlay};
  background: ${({ theme }) => theme.color.surface}; color: ${({ theme }) => theme.color.text};
  @media (max-width: 22rem) { border-radius: ${({ theme }) => theme.radius.none}; }
  font: inherit; font-size: .8125rem; text-align: start; overflow: hidden;
  &[open] { display: flex; flex-direction: column; }
  &::backdrop { background: ${({ theme }) => theme.color.scrim}; }
`;

export const DrawerHeader = styled.header`
  display: flex; align-items: center; justify-content: space-between; gap: 12px; flex: none;
  padding: 12px 16px; border-block-end: 1px solid ${({ theme }) => theme.color.border};
  h2 { font-size: .9375rem; line-height: 1.3; margin: 0; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
`;

export const DrawerButton = styled(Button)`
  && { min-block-size: 34px; min-inline-size: 34px; padding: 6px 8px; font-size: .75rem; line-height: 1.3; border-radius: ${({ theme }) => theme.radius.control}; }
  svg { inline-size: 15px; block-size: 15px; }
  ${media.belowDesktop} { && { min-block-size: 44px; min-inline-size: 44px; } }
  @media (pointer: coarse) { && { min-block-size: 44px; min-inline-size: 44px; } }
`;

export const DrawerBody = styled.div`
  padding: 16px; flex: 1; min-block-size: 0; min-inline-size: 0; overflow-y: auto; overscroll-behavior: contain;
  figure { margin: 0 0 16px; padding: 10px; background: ${({ theme }) => theme.color.surfaceMuted}; }
  [data-share-image] { display: block; inline-size: 100%; block-size: auto; }
  [data-image-pagination] { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-block-start: 8px; }
  [data-image-pagination] span { color: ${({ theme }) => theme.color.mutedText}; font-size: .6875rem; }
  [data-share-summary] { font-weight: ${({ theme }) => theme.typography.weight.bold}; margin: 0 0 8px; }
  [data-share-caption] { display: grid; gap: 5px; font-size: .75rem; }
  [data-share-caption] p { margin: 0; }
  [data-share-caption] a { overflow-wrap: anywhere; font-size: .6875rem; }
  [data-share-public-note] { color: ${({ theme }) => theme.color.mutedText}; font-size: .6875rem; margin: 12px 0 0; }
  [data-share-error] { color: ${({ theme }) => theme.color.outcome.incorrect.text}; }
  textarea { inline-size: 100%; min-block-size: 150px; resize: vertical; background: ${({ theme }) => theme.color.surface};
    color: inherit; border: 1px solid ${({ theme }) => theme.color.controlBorder}; border-radius: ${({ theme }) => theme.radius.control}; font: inherit; padding: 8px; }
`;

export const DrawerFooter = styled.footer`
  flex: none; padding: 12px 16px; border-block-start: 1px solid ${({ theme }) => theme.color.border};
  [data-share-secondary] { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px; margin-block-end: 9px; }
  [data-share-primary] { inline-size: 100%; }
  [data-share-feedback] { font-size: .6875rem; margin: 10px 0 0; color: ${({ theme }) => theme.color.mutedText}; }
`;
