"use client";

import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import styled from "styled-components";
import { Button } from "@/components/ui/controls";
import { CriteriaDialog, CriteriaDialogButton } from "@/components/ui/criteria-dialog";
import { MoreIcon } from "@/components/ui/icons";
import { media } from "@/styles/theme";
import { FormStack } from "./admin-form";

const Anchor = styled.div`display: contents;`;
const Dialog = styled(CriteriaDialog)`
  ${media.desktop} {
    &&[data-enhanced="true"] {
      inset: auto;
      left: var(--payment-dialog-x, 50%);
      top: var(--payment-dialog-y, 50%);
      transform: translate(-50%, -50%);
      margin: 0;
      max-inline-size: calc(var(--payment-dialog-width, 100vw) - var(--gh-size-6));
    }
  }
  header h2 {
    display: flex; align-items: center; gap: var(--gh-spacing-2);
    font-weight: var(--gh-weight-medium);
  }
  header h2 svg { color: ${({ theme }) => theme.color.outcome.incorrect.text}; }
`;
export const PaymentDialogCancel = styled(CriteriaDialogButton)`margin-inline-end: auto;`;

export function PaymentActionDialog({ title, closeLabel, children, footer, busy, onClose, dismissOnEscape = true }: {
  title: ReactNode; closeLabel?: string; children: ReactNode; footer: ReactNode; busy: boolean;
  onClose: () => void; dismissOnEscape?: boolean;
}) {
  const anchor = useRef<HTMLDivElement>(null), id = useId();
  useLayoutEffect(() => {
    const element = anchor.current, pane = element?.closest("#payment-review");
    if (!element || !pane) return;
    const position = () => {
      const bounds = pane.getBoundingClientRect();
      element.style.setProperty("--payment-dialog-x", `${bounds.left + bounds.width / 2}px`);
      element.style.setProperty("--payment-dialog-y", `${bounds.top + bounds.height / 2}px`);
      element.style.setProperty("--payment-dialog-width", `${bounds.width}px`);
    };
    position();
    const observer = new ResizeObserver(position);
    observer.observe(pane);
    window.addEventListener("resize", position);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", position);
    };
  }, []);
  return <Anchor ref={anchor}><Dialog id={id} title={title} open busy={busy} dismissOnEscape={dismissOnEscape}
    onCancel={onClose} closeLabel={closeLabel ?? "Close payment action"} footer={footer}>{children}</Dialog></Anchor>;
}

export type PaymentAction = Readonly<{ id: string; label: string; run: () => void; alignEnd?: boolean }>;
const MoreButton = styled(Button)`
  && { min-inline-size: var(--form-control-height); }
  ${media.belowDesktop} { && { padding-inline: 0; } }
  > span { display: none; }
  ${media.desktop} { > span { display: inline; } }
`;
const MenuAction = styled(CriteriaDialogButton)`&& { justify-content: flex-start; text-align: start; white-space: normal; overflow-wrap: anywhere; }`;

export function PaymentActionMenu({ actions, busy, compact }: {
  actions: readonly PaymentAction[]; busy: boolean; compact: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (!actions.length) return null;
  const [first] = actions;
  if (!compact && actions.length === 1 && first && !open) return <Button type="button" variant="secondary" disabled={busy}
    data-payment-action-end={first.alignEnd || undefined} onClick={first.run}>{first.label}</Button>;
  const close = () => setOpen(false);
  return <>
    {compact ? <MoreButton type="button" variant="quiet" aria-label="More payment actions" aria-haspopup="dialog" title="More payment actions"
      data-payment-more-actions disabled={busy} onClick={() => setOpen(true)}><MoreIcon /><span>More actions</span></MoreButton>
      : <Button type="button" variant="secondary" aria-haspopup="dialog" disabled={busy} onClick={() => setOpen(true)}>Payment actions</Button>}
    {open && <PaymentActionDialog title="Payment actions" busy={busy} onClose={close}
      footer={<PaymentDialogCancel type="button" variant="secondary" onClick={close}>Cancel</PaymentDialogCancel>}>
      <FormStack>{actions.map(action => <MenuAction key={action.id} type="button" variant="secondary" disabled={busy}
        onClick={() => { close(); action.run(); }}>{action.label}</MenuAction>)}</FormStack>
    </PaymentActionDialog>}
  </>;
}
