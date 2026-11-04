"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import styled from "styled-components";
import { CloseIcon } from "@/components/ui/icons";
import { ActionButton } from "./admin-form";
import { formSurface } from "./subscriber-styles";
import { dialogChromePadding, dialogFooterSurface, dialogHeaderSurface, dialogSurface } from "@/components/ui/dialog-surfaces";

type SubscriberReviewDialogProps = {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  id?: string;
  busy?: boolean;
};

/** Reusable review dialog: native modality keeps keyboard focus within an action. */
export function SubscriberReviewDialog({ open, title, onClose, children, footer, id, busy = false }: SubscriberReviewDialogProps) {
  const generatedId = useId(), dialogId = id ?? generatedId, root = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = root.current;
    if (!open || !element) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (typeof element.showModal === "function") element.showModal();
    else element.setAttribute("open", "");
    element.querySelector<HTMLElement>('input:not([type="hidden"]):not(:disabled), select:not(:disabled), textarea:not(:disabled)')?.focus();
    return () => {
      if (element.open && typeof element.close === "function") element.close();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [open]);
  if (!open) return null;
  return <Dialog id={dialogId} ref={root} aria-labelledby={`${dialogId}-title`} aria-busy={busy} data-subscriber-dialog
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <Header><h2 id={`${dialogId}-title`}>{title}</h2><CloseButton type="button" aria-label="Close dialog" disabled={busy} onClick={onClose}><CloseIcon /></CloseButton></Header>
    <Body>{children}</Body>
    {footer && <Footer>{footer}</Footer>}
  </Dialog>;
}

const Dialog = styled.dialog`
  position: fixed; inset: 0; inline-size: min(var(--gh-size-160), calc(100vw - var(--gh-size-6))); max-inline-size: calc(100vw - var(--gh-size-6));
  max-block-size: calc(100dvh - var(--gh-size-6)); min-inline-size: 0; margin: auto; padding: 0; overflow: hidden;
  border: 0; border-radius: ${({ theme }) => theme.radius.overlay};
  color: ${({ theme }) => theme.color.text}; ${dialogSurface} font: inherit;
  &[open] { display: flex; flex-direction: column; }
  &::backdrop { background: ${({ theme }) => theme.color.scrim}; }
  *, *::before, *::after { box-sizing: border-box; }
`;
const Header = styled.header`
  ${dialogHeaderSurface}
  ${dialogChromePadding}
  display: flex; flex: none; align-items: center; justify-content: space-between; gap: var(--gh-spacing-3);
  border-block-end: 0;
  h2 { margin: 0; min-inline-size: 0; font-size: var(--gh-font-section); overflow-wrap: anywhere; }
`;
const CloseButton = styled(ActionButton)`
  flex: none; min-inline-size: var(--gh-size-9); min-block-size: var(--form-control-height); padding: 0;
  @media (pointer: coarse) { min-inline-size: var(--gh-size-11); min-block-size: var(--form-control-height); }
`;
const Body = styled.div`
  ${dialogSurface}
  ${formSurface}
  min-inline-size: 0; min-block-size: 0; padding: var(--gh-spacing-3_5); overflow-y: auto; overscroll-behavior: contain;
  [data-subscriber-action-dialog] { display: grid; gap: var(--gh-spacing-3); min-inline-size: 0; }
`;
const Footer = styled.footer`
  ${dialogFooterSurface}
  ${dialogChromePadding}
  display: flex; flex: none; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: var(--gh-spacing-2);
  border-block-start: 0;
  > button { min-block-size: var(--form-control-height); }
  @media (pointer: coarse) { > button { min-block-size: var(--form-control-height); } }
`;
