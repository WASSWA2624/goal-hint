"use client";

import styled from "styled-components";
import { media } from "@/styles/theme";
import { Button } from "@/components/ui/controls";
import { textFieldSurface } from "@/components/ui/filled-surfaces";
import { slipHeaderActionFrame } from "../slip-disclosure-styles";
import { dialogFooterSurface, dialogHeaderSurface, dialogSurface } from "@/components/ui/dialog-surfaces";

export const ShareTrigger = styled(Button)`
  && { min-block-size: var(--slip-header-action-size, var(--gh-size-7)); block-size: var(--slip-header-action-size, var(--gh-size-7)); min-inline-size: 0; padding: var(--gh-spacing-0_75) var(--gh-spacing-1_75); gap: var(--gh-spacing-1_25); border-radius: ${({ theme }) => theme.radius.control};
    font-size: var(--gh-font-secondary); line-height: var(--gh-leading-heading); font-weight: ${({ theme }) => theme.typography.weight.medium}; }
  svg { inline-size: var(--gh-size-3_5); block-size: var(--gh-size-3_5); }
  &&[data-share-icon-only] {
    ${slipHeaderActionFrame}
    inline-size: var(--slip-header-action-size, var(--gh-size-7)); min-inline-size: var(--slip-header-action-size, var(--gh-size-7));
    padding: 0;
    &:disabled { color: ${({ theme }) => theme.color.disabledText}; background: ${({ theme }) => theme.color.disabledSurface};  }
  }
  &[data-share-icon-only] svg { inline-size: var(--gh-size-4); block-size: var(--gh-size-4); }
`;

export const Drawer = styled.dialog`
  position: fixed; inset-block: 0; inset-inline: auto 0;
  inline-size: min(var(--gh-size-88), 100vw); max-inline-size: 100vw; block-size: 100dvh; max-block-size: 100dvh;
  margin: 0 0 0 auto; padding: 0; border: 0; border-inline-start: 0;
  border-radius: ${({ theme }) => theme.radius.none};
  border-start-start-radius: ${({ theme }) => theme.radius.overlay}; border-end-start-radius: ${({ theme }) => theme.radius.overlay};
  ${dialogSurface} color: ${({ theme }) => theme.color.text};
  @media (max-width: ${({ theme }) => theme.viewport[22]}) { border-radius: ${({ theme }) => theme.radius.none}; }
  font: inherit; font-size: var(--gh-font-body); text-align: start; overflow: hidden;
  &[open] { display: flex; flex-direction: column; }
  &::backdrop { background: ${({ theme }) => theme.color.scrim}; }
`;

export const DrawerHeader = styled.header`
  ${dialogHeaderSurface}
  display: flex; align-items: center; justify-content: space-between; gap: var(--gh-spacing-3); flex: none;
  padding: var(--gh-spacing-3) var(--gh-spacing-4); border-block-end: 0;
  h2 { font-size: var(--gh-font-reading); line-height: var(--gh-leading-label); margin: 0; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
`;

export const DrawerButton = styled(Button)`
  && { min-block-size: var(--form-control-height); min-inline-size: var(--gh-size-8_5); padding: var(--gh-spacing-1_5) var(--gh-spacing-2); font-size: var(--gh-font-secondary); line-height: var(--gh-leading-label); border-radius: ${({ theme }) => theme.radius.control}; }
  svg { inline-size: var(--gh-size-3_75); block-size: var(--gh-size-3_75); }
  ${media.belowDesktop} { && { min-block-size: var(--form-control-height); min-inline-size: var(--gh-size-11); } }
  @media (pointer: coarse) { && { min-block-size: var(--form-control-height); min-inline-size: var(--gh-size-11); } }
`;

export const DrawerBody = styled.div`
  ${dialogSurface}
  padding: var(--gh-spacing-4); flex: 1; min-block-size: 0; min-inline-size: 0; overflow-y: auto; overscroll-behavior: contain;
  figure { margin: 0 0 var(--gh-spacing-4); padding: var(--gh-spacing-2_5); background: ${({ theme }) => theme.color.surfaceMuted}; }
  [data-share-image] { display: block; inline-size: 100%; block-size: auto; }
  [data-image-pagination] { display: flex; align-items: center; justify-content: space-between; gap: var(--gh-spacing-2); margin-block-start: var(--gh-spacing-2); }
  [data-image-pagination] span { color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-caption); }
  [data-share-summary] { font-weight: ${({ theme }) => theme.typography.weight.bold}; margin: 0 0 var(--gh-spacing-2); }
  [data-share-caption] { display: grid; gap: var(--gh-spacing-1_25); font-size: var(--gh-font-secondary); }
  [data-share-caption] p { margin: 0; }
  [data-share-caption] a { overflow-wrap: anywhere; font-size: var(--gh-font-caption); }
  [data-share-public-note] { color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-caption); margin: var(--gh-spacing-3) 0 0; }
  [data-share-error] { color: ${({ theme }) => theme.color.outcome.incorrect.text}; }
  textarea { inline-size: 100%; min-block-size: var(--gh-size-37_5); resize: vertical; background: ${({ theme }) => theme.color.field};
    color: inherit; border: 0; border-radius: ${({ theme }) => theme.radius.control}; font: inherit; padding: var(--gh-spacing-2); ${textFieldSurface} }
`;

export const DrawerFooter = styled.footer`
  ${dialogFooterSurface}
  flex: none; padding: var(--gh-spacing-3) var(--gh-spacing-4); border-block-start: 0;
  [data-share-actions] { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--gh-spacing-2); }
  [data-share-secondary] { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--gh-spacing-1_5); margin-block-end: var(--gh-spacing-2_25); }
  [data-share-primary] { inline-size: 100%; }
  [data-share-feedback] { font-size: var(--gh-font-caption); margin: var(--gh-spacing-2_5) 0 0; color: ${({ theme }) => theme.color.mutedText}; }
`;
