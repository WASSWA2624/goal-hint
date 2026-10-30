"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import styled from "styled-components";
import { CloseIcon } from "@/components/ui/icons";
import { ActionButton } from "./admin-form";
import { formSurface } from "./subscriber-styles";

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
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
    onClick={event => {
      if (busy || event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
    }}>
    <Header><h2 id={`${dialogId}-title`}>{title}</h2><CloseButton type="button" aria-label="Close dialog" disabled={busy} onClick={onClose}><CloseIcon /></CloseButton></Header>
    <Body>{children}</Body>
    {footer && <Footer>{footer}</Footer>}
  </Dialog>;
}

const Dialog = styled.dialog`
  position: fixed; inset: 0; inline-size: min(40rem, calc(100vw - 24px)); max-inline-size: calc(100vw - 24px);
  max-block-size: calc(100dvh - 24px); min-inline-size: 0; margin: auto; padding: 0; overflow: hidden;
  border: 1px solid ${({ theme }) => theme.color.controlBorder}; border-radius: ${({ theme }) => theme.radius.overlay};
  color: ${({ theme }) => theme.color.text}; background: ${({ theme }) => theme.color.surface}; font: inherit;
  &[open] { display: flex; flex-direction: column; }
  &::backdrop { background: ${({ theme }) => theme.color.scrim}; }
  *, *::before, *::after { box-sizing: border-box; }
`;
const Header = styled.header`
  display: flex; flex: none; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 14px;
  border-block-end: 1px solid ${({ theme }) => theme.color.border};
  h2 { margin: 0; min-inline-size: 0; font-size: 1rem; overflow-wrap: anywhere; }
`;
const CloseButton = styled(ActionButton)`
  flex: none; min-inline-size: 36px; min-block-size: 36px; padding: 0;
  @media (pointer: coarse) { min-inline-size: 44px; min-block-size: 44px; }
`;
const Body = styled.div`
  ${formSurface}
  min-inline-size: 0; min-block-size: 0; padding: 14px; overflow-y: auto; overscroll-behavior: contain;
  [data-subscriber-action-dialog] { display: grid; gap: 12px; min-inline-size: 0; }
`;
const Footer = styled.footer`
  display: flex; flex: none; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; padding: 10px 14px;
  border-block-start: 1px solid ${({ theme }) => theme.color.border};
  > button { min-block-size: 36px; }
  @media (pointer: coarse) { > button { min-block-size: 44px; } }
`;
