"use client";

import { useCallback, useId, useRef, useState } from "react";
import styled from "styled-components";
import { anchoredPanel, useAnchoredPanel } from "./anchored-panel";
import { focusRing } from "./filter-chrome";
import { FloatingField } from "./floating-field";
import { useOutsideDismiss } from "./use-outside-dismiss";

const Root = styled.div`position: relative; min-inline-size: 0;`;

const Trigger = styled.button`
  position: absolute; inset: var(--floating-label-space) 0 0;
  z-index: var(--gh-layer-raised);
  padding: 0; border: 0; border-radius: ${({ theme }) => theme.radius.control};
  background: transparent; cursor: help;
  ${focusRing}
`;

const Explanation = styled.span`
  ${anchoredPanel}
  z-index: var(--gh-layer-tooltip);
  inline-size: max-content;
  padding: var(--gh-spacing-1) var(--gh-spacing-2);
  border: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.control};
  background: ${({ theme }) => theme.color.surface}; color: ${({ theme }) => theme.color.text};
  box-shadow: ${({ theme }) => theme.shadow.popover};
  font-size: var(--gh-font-secondary); line-height: var(--gh-leading-label);
  overflow-wrap: anywhere;
`;

/** A disabled input stays out of the form while its explanation remains reachable. */
export function UnavailableField({ label, reason }: { label: string; reason: string }) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const explanation = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  useOutsideDismiss({ enabled: open, root, onDismiss: close });
  useAnchoredPanel({ open, anchor: trigger, panel: explanation });

  return <Root ref={root}>
    <FloatingField label={label}><input disabled aria-hidden="true" /></FloatingField>
    <Trigger ref={trigger} type="button" aria-label={label} aria-describedby={id}
      onFocus={() => setOpen(true)} onBlur={close}
      onClick={event => { event.currentTarget.focus({ preventScroll: true }); setOpen(true); }}
      onKeyDown={event => {
        if (!open || event.key !== "Escape") return;
        event.preventDefault(); event.stopPropagation(); close();
      }} />
    <Explanation ref={explanation} id={id} role="tooltip" hidden={!open}>{reason}</Explanation>
  </Root>;
}
