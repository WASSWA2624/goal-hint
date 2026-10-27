"use client";

import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import styled from "styled-components";
import { Button } from "./controls";
import { CloseIcon } from "./icons";

const subscribe = () => () => {};
const serverSnapshot = () => false;
const supportsModalDialog = () => typeof HTMLDialogElement !== "undefined"
  && typeof HTMLDialogElement.prototype.showModal === "function";

const Dialog = styled.dialog`
  position: fixed;
  inset: 0;
  box-sizing: border-box;
  inline-size: min(30rem, calc(100vw - 24px));
  max-inline-size: calc(100vw - 24px);
  max-block-size: calc(100dvh - 24px);
  min-inline-size: 0;
  margin: auto;
  padding: 0;
  overflow: hidden;
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.surface};
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.border.radius};
  font: inherit;

  &[open] { display: flex; flex-direction: column; }
  &::backdrop { background: ${({ theme }) => theme.color.scrim}; }

  /* One successful input tree remains usable before hydration and without JavaScript. */
  &[data-enhanced="false"] {
    position: static;
    display: block;
    inline-size: auto;
    max-inline-size: none;
    max-block-size: none;
    margin: 0;
    overflow: visible;
    border-color: ${({ theme }) => theme.color.border};
  }
`;

const Header = styled.header`
  display: flex;
  flex: none;
  align-items: center;
  gap: 10px;
  min-inline-size: 0;
  padding: 10px 12px;
  border-block-end: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};

  > h2 { margin: 0; font-size: 1rem; line-height: 1.3; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  [data-enhanced="false"] > & { padding: 9px 12px; border: 0; }
`;

const CloseButton = styled(Button)`
  && {
    flex: none;
    min-inline-size: 2.25rem;
    min-block-size: 2.25rem;
    margin-inline-start: auto;
    padding: 0;
    border: 0;
    border-radius: ${({ theme }) => theme.border.radius};
    color: ${({ theme }) => theme.color.mutedText};
    > svg { font-size: 1.125rem; }
    @media (pointer: coarse) { min-inline-size: 44px; min-block-size: 44px; }
  }
  [data-enhanced="false"] & { display: none; }
`;

const Body = styled.div`
  min-inline-size: 0;
  min-block-size: 0;
  padding: 12px;
  overflow-y: auto;
  overscroll-behavior: contain;

  [data-enhanced="false"] > & { padding-block-start: 0; overflow: visible; }
`;

const Actions = styled.footer`
  display: flex;
  flex: none;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 10px 12px;
  border-block-start: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};

  > [data-dialog-reset] { margin-inline-end: auto; flex: none; }
  [data-enhanced="false"] > & { display: none; }
`;

const ActionButton = styled(Button)`
  && {
    min-block-size: 2.25rem;
    padding: 6px 12px;
    border-radius: ${({ theme }) => theme.border.radius};
    font-size: 0.8125rem;
    line-height: 1.3;
    @media (pointer: coarse) { min-block-size: 44px; }
  }
`;

type ResetAction = { onReset: () => void; resetLabel: string } | { onReset?: never; resetLabel?: never };

export type CriteriaDialogProps = Readonly<{
  id: string;
  group?: string;
  title: ReactNode;
  open: boolean;
  onCancel: () => void;
  onApply: () => void;
  applyLabel: string;
  cancelLabel: string;
  closeLabel: string;
  children: ReactNode;
  className?: string;
} & ResetAction>;

/** Native modality and focus handling, retaining inline GET-form fields without JavaScript. */
export function CriteriaDialog({ id, group, title, open, onCancel, onApply, onReset, applyLabel, cancelLabel, closeLabel, resetLabel, children, className }: CriteriaDialogProps) {
  const root = useRef<HTMLDialogElement>(null);
  const enhanced = useSyncExternalStore(subscribe, supportsModalDialog, serverSnapshot);
  const titleId = `${id}-title`;

  useEffect(() => {
    const element = root.current;
    if (!element || !enhanced) return;
    if (open && !element.open) {
      element.showModal();
      element.querySelector<HTMLElement>('input:not([type="hidden"]):not(:disabled), select:not(:disabled), textarea:not(:disabled)')?.focus();
    } else if (!open && element.open) element.close();
  }, [enhanced, open]);

  return <Dialog id={id} ref={root} className={className} open={enhanced ? undefined : true}
    aria-labelledby={titleId} data-criteria-dialog="" data-slip-criteria-group={group} data-enhanced={enhanced ? "true" : "false"}
    onCancel={(event) => { event.preventDefault(); onCancel(); }}
    onClick={(event) => {
      if (event.target !== event.currentTarget || !enhanced) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onCancel();
    }}
    onKeyDown={(event) => {
      if (!enhanced || !open || event.defaultPrevented || event.nativeEvent.isComposing || event.key !== "Enter") return;
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || ["button", "submit", "reset"].includes(target.type)) return;
      event.preventDefault(); onApply();
    }}>
    <Header><h2 id={titleId}>{title}</h2><CloseButton type="button" variant="quiet" aria-label={closeLabel} onClick={onCancel}><CloseIcon /></CloseButton></Header>
    <Body>{children}</Body>
    <Actions>
      {onReset && <ActionButton type="button" variant="secondary" data-dialog-reset onClick={onReset}>{resetLabel}</ActionButton>}
      <ActionButton type="button" variant="secondary" onClick={onCancel}>{cancelLabel}</ActionButton>
      <ActionButton type="button" onClick={onApply}>{applyLabel}</ActionButton>
    </Actions>
  </Dialog>;
}
