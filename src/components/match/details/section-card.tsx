"use client";

import { createContext, useContext, useEffect, useRef, type ReactNode, type RefObject } from "react";
import { openSection, type MatchSection } from "@/domain/match-view";
import type { AccentName } from "@/styles/theme";
import { Card, CardHeader, Crumbs, HiddenHeading, LinkButton, Panel, PanelHeading, useDetails, useRevealOnOpen, useStableDetails } from "./details-ui";

/**
 * One section's disclosure, owned by the match page: whether it is open, whether it is open only because desktop
 * opens every section by default (phones hide those until they hydrate), a counter that grows each time the
 * reader opens the section or arrives at it from a link (each increase scrolls to it and focuses it), and the
 * header's toggle.
 */
export type SectionDisclosure = Readonly<{ open: boolean; byDefault: boolean; reveal: number; toggle: () => void }>;
const DisclosureContext = createContext<SectionDisclosure | null>(null);
export const DisclosureProvider = DisclosureContext.Provider;
function useDisclosure(): SectionDisclosure {
  const value = useContext(DisclosureContext);
  if (!value) throw new Error("Section disclosure is missing.");
  return value;
}

/**
 * Drawer row → section → item. A closed row shows only the section's one-line summary; an open one shows the
 * complete section beneath the row, with breadcrumbs inside an item and an explicit collapse action.
 * Collapsing hides the existing content instead of removing server-rendered previews from mobile pages.
 */
export function SectionCard({ section, icon, title, meta, itemLabel, children }: {
  section: MatchSection; icon: ReactNode; title: string; meta?: ReactNode; itemLabel?: string | null; children: ReactNode;
}) {
  const { view, update, messages } = useDetails();
  const { open, byDefault, reveal, toggle } = useDisclosure();
  const panelId = `section-${section}`, headingId = `${panelId}-title`;
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  // An item opened from a deep link focuses itself instead of the section heading.
  const heading = useRevealOnOpen<HTMLHeadingElement>(open && reveal > 0 && view.item === null, `${section}:${reveal}`, "card");
  const wasOpen = useRef(open);
  useEffect(() => {
    // A retained hidden panel must not keep focus on one of its descendants after collapsing.
    if (wasOpen.current && !open && (document.activeElement === null || document.activeElement === document.body ||
        panel.current?.contains(document.activeElement))) button.current?.focus();
    wasOpen.current = open;
  }, [open]);
  const closeItem = () => update((current) => ({ ...current, item: null }));
  return <Card data-section={section} data-open={open || undefined} data-open-by-default={byDefault || undefined} aria-labelledby={headingId}>
    <CardHeader icon={icon} title={title} meta={meta} open={open} controls={panelId} onToggle={toggle}
      headingId={headingId} buttonRef={button} />
    <div ref={panel} id={panelId} hidden={!open}>
      <Panel>
        <Crumbs shallow={!itemLabel} items={[{ label: messages.text("details.title"), onSelect: () => update((current) => openSection(current, null)) },
          itemLabel ? { label: title, onSelect: closeItem } : { label: title }, ...(itemLabel ? [{ label: itemLabel }] : [])]} />
        <HiddenHeading ref={heading} tabIndex={-1}>{title}</HiddenHeading>
        {children}
        <LinkButton type="button" onClick={toggle}>{messages.text("details.collapse", { section: title })}</LinkButton>
      </Panel>
    </div>
  </Card>;
}

/** A nested item view inside an opened section; Back returns to the list with its filters and page. */
export function ItemPanel({ itemKey, title, accent = "blue", children }: { itemKey: string; title: string; accent?: AccentName; children: ReactNode }) {
  const { update, messages } = useStableDetails();
  const heading = useRevealOnOpen<HTMLHeadingElement>(true, itemKey, "card");
  return <Panel data-item-panel={itemKey} style={{ borderColor: "transparent", paddingBlockStart: 0 }}>
    <LinkButton type="button" onClick={() => update((current) => ({ ...current, item: null }))}>‹ {messages.text("details.backToList")}</LinkButton>
    <PanelHeading as="h4" ref={heading} tabIndex={-1} data-accent={accent}>{title}</PanelHeading>
    {children}
  </Panel>;
}

/** After an item closes, focus returns to the row that opened it (restoring the list position). */
export function useReturnFocus(container: RefObject<HTMLElement | null>, item: string | null) {
  const previous = useRef(item);
  useEffect(() => {
    if (previous.current && !item) {
      const row = container.current?.querySelector<HTMLElement>(`[data-item-key="${CSS.escape(previous.current)}"]`);
      row?.focus();
    }
    previous.current = item;
  }, [container, item]);
}
