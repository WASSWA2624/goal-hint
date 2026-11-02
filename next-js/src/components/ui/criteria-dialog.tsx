"use client";

import { useEffect, useRef, useSyncExternalStore, type ReactNode, type Ref } from "react";
import styled from "styled-components";
import { Button } from "./controls";
import { CloseIcon } from "./icons";
import { dialogFooterSurface, dialogHeaderSurface, dialogSurface } from "./dialog-surfaces";
import { controlRow } from "./control-layout";

const subscribe = () => () => {};
const serverSnapshot = () => false;
const supportsModalDialog = () => typeof HTMLDialogElement !== "undefined"
  && typeof HTMLDialogElement.prototype.showModal === "function";

const Dialog = styled.dialog`
  position: fixed;
  inset: 0;
  box-sizing: border-box;
  inline-size: min(var(--gh-size-120), calc(100vw - var(--gh-size-6)));
  max-inline-size: calc(100vw - var(--gh-size-6));
  max-block-size: calc(100dvh - var(--gh-size-6));
  min-inline-size: 0;
  margin: auto;
  padding: 0;
  overflow: hidden;
  color: ${({ theme }) => theme.color.text};
  ${dialogSurface}
  box-shadow: ${({ theme }) => theme.shadow.popover};
  border: 0;
  border-radius: ${({ theme }) => theme.radius.overlay};
  font: inherit;

  &[open] { display: flex; flex-direction: column; }
  &::backdrop { background: ${({ theme }) => theme.color.scrim}; }

  /* One successful input tree remains usable before hydration and without JavaScript. */
  &[data-enhanced="false"] {
    box-shadow: none;
    position: static;
    display: block;
    inline-size: auto;
    max-inline-size: none;
    max-block-size: none;
    margin: 0;
    overflow: visible;

  }
`;

const Header = styled.header`
  ${dialogHeaderSurface}
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--gh-spacing-2_5);
  min-inline-size: 0;
  padding: var(--gh-spacing-2_5) var(--gh-spacing-3);
  border-block-end: 0;

  > h2 { margin: 0; font-size: var(--gh-font-section); line-height: var(--gh-leading-label); font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  [data-enhanced="false"] > & { padding: var(--gh-spacing-2_25) var(--gh-spacing-3); border: 0; }
`;

const CloseButton = styled(Button)`
  && {
    flex: none;
    min-inline-size: var(--gh-size-9);
    min-block-size: var(--form-control-height);
    margin-inline-start: auto;
    padding: 0;
    border: 0;
    border-radius: ${({ theme }) => theme.radius.control};
    color: ${({ theme }) => theme.color.mutedText};
    > svg { font-size: var(--gh-font-title); }
    @media (pointer: coarse) { min-inline-size: var(--gh-size-11); min-block-size: var(--form-control-height); }
  }
  [data-enhanced="false"] & { display: none; }
`;

const Body = styled.div`
  ${dialogSurface}
  min-inline-size: 0;
  min-block-size: 0;
  padding: var(--gh-spacing-3);
  overflow-y: auto;
  overscroll-behavior: contain;

  [data-enhanced="false"] > & { padding-block-start: 0; overflow: visible; }
`;

const Actions = styled.footer`
  ${dialogFooterSurface}
  display: flex;
  flex: none;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: var(--gh-spacing-2);
  padding: var(--gh-spacing-2_5) var(--gh-spacing-3);
  border-block-start: 0;

  ${controlRow}
  > [data-dialog-reset] { margin-inline-end: auto; flex: none; }
  [data-enhanced="false"] > & { display: none; }
`;

export const CriteriaDialogButton = styled(Button)`
  && {
    min-block-size: var(--form-control-height);
    padding: var(--gh-spacing-1_5) var(--gh-spacing-3);
    border-radius: ${({ theme }) => theme.radius.control};
    font-size: var(--gh-font-body);
    line-height: var(--gh-leading-label);
  }
`;

type ResetAction = { onReset: () => void; resetLabel: string } | { onReset?: never; resetLabel?: never };
type DialogActions = { footer?: never; onApply: () => void; applyLabel: string; cancelLabel: string }
  | { footer: ReactNode; onApply?: () => void; applyLabel?: never; cancelLabel?: never };

export type CriteriaDialogProps = Readonly<{
  id: string;
  group?: string;
  title: ReactNode;
  open: boolean;
  onCancel: () => void;
  closeLabel: string;
  closeButtonRef?: Ref<HTMLButtonElement>;
  children: ReactNode;
  className?: string;
  busy?: boolean;
  dismissOnBackdrop?: boolean;
  dismissOnEscape?: boolean;
} & ResetAction & DialogActions>;

/** Native modality and focus handling, retaining inline GET-form fields without JavaScript. */
export function CriteriaDialog({ id, group, title, open, onCancel, onApply, onReset, applyLabel, cancelLabel, closeLabel, closeButtonRef, resetLabel, children, className, busy = false, dismissOnBackdrop = true, dismissOnEscape = true, footer }: CriteriaDialogProps) {
  const root = useRef<HTMLDialogElement>(null);
  const enhanced = useSyncExternalStore(subscribe, supportsModalDialog, serverSnapshot);
  const titleId = `${id}-title`;

  useEffect(() => {
    const element = root.current;
    if (!element || !enhanced) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (open && !element.open) {
      element.showModal();
      element.querySelector<HTMLElement>('input:not([type="hidden"]):not(:disabled), select:not(:disabled), textarea:not(:disabled)')?.focus();
    } else if (!open && element.open) element.close();
    return () => {
      if (element.open) element.close();
      // React may already have removed a conditionally rendered dialog.
      if (open && opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [enhanced, open]);

  return <Dialog id={id} ref={root} className={className} open={enhanced ? undefined : true}
    aria-labelledby={titleId} aria-busy={busy} data-criteria-dialog="" data-slip-criteria-group={group} data-enhanced={enhanced ? "true" : "false"}
    onCancel={(event) => { event.preventDefault(); if (dismissOnEscape) onCancel(); }}
    onClick={(event) => {
      if (!dismissOnBackdrop || event.target !== event.currentTarget || !enhanced) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onCancel();
    }}
    onKeyDown={(event) => {
      if (!enhanced || !open || !onApply || event.defaultPrevented || event.nativeEvent.isComposing || event.key !== "Enter") return;
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || ["button", "submit", "reset"].includes(target.type)) return;
      event.preventDefault(); onApply();
    }}>
    <Header><h2 id={titleId}>{title}</h2><CloseButton ref={closeButtonRef} type="button" variant="quiet" aria-label={closeLabel} disabled={busy} onClick={onCancel}><CloseIcon /></CloseButton></Header>
    <Body>{children}</Body>
    <Actions>
      {footer ?? <>
        {onReset && <CriteriaDialogButton type="button" variant="secondary" data-dialog-reset disabled={busy} onClick={onReset}>{resetLabel}</CriteriaDialogButton>}
        <CriteriaDialogButton type="button" variant="secondary" disabled={busy} onClick={onCancel}>{cancelLabel}</CriteriaDialogButton>
        <CriteriaDialogButton type="button" disabled={busy} onClick={onApply}>{applyLabel}</CriteriaDialogButton>
      </>}
    </Actions>
  </Dialog>;
}
