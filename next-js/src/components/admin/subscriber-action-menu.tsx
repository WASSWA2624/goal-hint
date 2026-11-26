"use client";

import { useCallback, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import styled from "styled-components";
import { anchoredPanel, useAnchoredPanel } from "@/components/ui/anchored-panel";
import { Button, ButtonLink } from "@/components/ui/controls";
import { useOutsideDismiss } from "@/components/ui/use-outside-dismiss";

export function SubscriberActionMenu({ label, children, disabled, icon }: {
  label: string;
  children: (choose: () => void) => ReactNode;
  disabled?: boolean;
  icon?: ReactNode;
}) {
  const id = useId(), root = useRef<HTMLDivElement>(null), button = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  if (disabled && open) setOpen(false);
  const expanded = open && !disabled;
  const close = useCallback(() => setOpen(false), []);
  function closeAndFocus() {
    close();
    button.current?.focus({ preventScroll: true });
  }
  useOutsideDismiss({ enabled: expanded, root, onDismiss: close });
  useAnchoredPanel({ open: expanded, anchor: button, panel });
  useLayoutEffect(() => {
    if (expanded) panel.current?.querySelector<HTMLElement>("button:not(:disabled), a[href]")?.focus({ preventScroll: true });
  }, [expanded]);

  return <MenuRoot ref={root} onKeyDown={event => {
    if (expanded && event.key === "Escape") { event.preventDefault(); closeAndFocus(); }
  }} onBlur={event => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) close(); }}>
    <Trigger ref={button} variant={icon ? "quiet" : "secondary"} aria-label={label} title={icon ? label : undefined}
      aria-expanded={expanded} aria-controls={expanded ? id : undefined} disabled={disabled} onClick={() => setOpen(!expanded)}>
      {icon ?? label}
    </Trigger>
    {expanded && <Popup id={id} ref={panel} role="group" aria-label={label} onClick={event => {
      if (event.target instanceof Element && event.target.closest("button, a[href]")) closeAndFocus();
    }}>{children(close)}</Popup>}
  </MenuRoot>;
}

const MenuRoot = styled.div`position: relative; flex: none;`;
const Trigger = styled(Button)`
  && { min-inline-size: var(--form-control-height); }
  > svg { flex: none; }
  &:has(> svg) { inline-size: var(--form-control-height); padding-inline: 0; }
`;
const Popup = styled.div`
  ${anchoredPanel}
  z-index: var(--gh-layer-tooltip);
  display: grid;
  inline-size: max-content;
  min-inline-size: var(--gh-size-40);
  max-block-size: var(--anchored-panel-space, 60dvh);
  overflow: auto;
  padding: var(--gh-spacing-1);
  border: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.control};
  background: ${({ theme }) => theme.color.surface};
  box-shadow: ${({ theme }) => theme.shadow.popover};
  > :is(a, button) { justify-content: flex-start; text-align: start; white-space: normal; }
`;

export const SubscriberMenuButton = styled(Button).attrs({ variant: "quiet" })``;
export const SubscriberMenuLink = styled(ButtonLink).attrs({ variant: "quiet" })``;
