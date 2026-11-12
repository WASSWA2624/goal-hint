"use client";

import type { ComponentPropsWithRef, ReactNode } from "react";
import styled from "styled-components";
import { media } from "@/styles/theme";
import { controlBodyHeight } from "./control-layout";
import { filterButtonColors, focusRing } from "./filter-chrome";
import { SlidersIcon } from "./icons";

const Trigger = styled.button<{ $compact: boolean }>`
  ${controlBodyHeight}
  ${filterButtonColors}
  display: inline-flex; align-items: center; justify-content: center; gap: var(--gh-spacing-1_5);
  min-inline-size: var(--form-control-height); padding: 0 var(--gh-spacing-2);
  border-radius: ${({ theme }) => theme.radius.control};
  font: inherit; font-size: var(--gh-font-secondary); font-weight: var(--gh-weight-medium);
  white-space: nowrap; cursor: pointer;
  > svg { flex: none; font-size: var(--gh-font-section); }
  ${({ $compact }) => $compact && `${media.belowDesktop} { > span, > b { display: none; } }`}
  ${media.hover} { &:hover:not(:disabled) { background: ${({ theme }) => theme.color.fieldHover}; } }
  &:active:not(:disabled) { background: ${({ theme }) => theme.color.rowHover}; }
  &:disabled { color: ${({ theme }) => theme.color.disabledText}; background: ${({ theme }) => theme.color.disabledSurface}; cursor: not-allowed; }
  ${focusRing}
`;

export function FilterDialogTrigger({ dialogId, open, children, count, compact = false, icon = <SlidersIcon />, ...props }:
  Omit<ComponentPropsWithRef<"button">, "type"> & { dialogId: string; open: boolean; count?: number | undefined; compact?: boolean; icon?: ReactNode }) {
  return <Trigger {...props} $compact={compact} type="button" aria-haspopup="dialog" aria-controls={dialogId} aria-expanded={open}>
    {icon}<span>{children}</span>{!!count && <b aria-hidden="true">{count}</b>}
  </Trigger>;
}
