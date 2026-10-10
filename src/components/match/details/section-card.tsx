"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { ArrowRightIcon } from "@/components/ui/icons";
import { openSection, type MatchSection } from "@/domain/match-view";
import type { AccentName } from "@/styles/theme";
import { Card, CardHeader, Crumbs, HiddenHeading, LinkButton, Panel, PanelHeading, PreviewArea, useDetails, useRevealOnOpen } from "./details-ui";

/**
 * Overview card → opened section → item. The preview stays compact; opening reveals the complete
 * section inside the same card (full width), with breadcrumbs and an explicit collapse action.
 */
export function SectionCard({ section, icon, accent, title, meta, preview, viewAll, itemLabel, children }: {
  section: MatchSection; icon: ReactNode; accent: AccentName; title: string; meta?: string | null;
  preview: ReactNode; viewAll: string; itemLabel?: string | null; children: ReactNode;
}) {
  const { view, go, messages } = useDetails();
  const open = view.section === section;
  const panelId = `section-${section}`, headingId = `${panelId}-title`;
  const button = useRef<HTMLButtonElement>(null);
  // An item opened straight from the preview focuses itself instead of the section heading.
  const heading = useRevealOnOpen<HTMLHeadingElement>(open && view.item === null, section, "card");
  const wasOpen = useRef(open);
  useEffect(() => {
    // Collapsing (not switching to another section) returns focus to this card's heading.
    if (wasOpen.current && !open && view.section === null) button.current?.focus();
    wasOpen.current = open;
  }, [open, view.section]);
  const toggle = () => go(openSection(view, open ? null : section));
  const closeItem = () => go({ ...view, item: null });
  return <Card data-section={section} data-open={open || undefined} $open={open} $accent={accent} aria-labelledby={headingId}>
    <CardHeader icon={icon} accent={accent} title={title} meta={meta} open={open} controls={panelId} onToggle={toggle}
      headingId={headingId} buttonRef={button} />
    {!open && <>
      <PreviewArea data-preview onClick={(event) => {
        // Rows inside a preview open their own item; only clicks on plain content open the section.
        if (!(event.target as Element).closest("a, button, input, select, textarea")) toggle();
      }}>{preview}</PreviewArea>
      <LinkButton type="button" onClick={toggle} aria-controls={panelId} aria-expanded={false}>{viewAll}<ArrowRightIcon /></LinkButton>
    </>}
    <div id={panelId} hidden={!open}>
      {open && <Panel>
        <Crumbs items={[{ label: messages.text("details.title"), onSelect: () => go(openSection(view, null)) },
          itemLabel ? { label: title, onSelect: closeItem } : { label: title }, ...(itemLabel ? [{ label: itemLabel }] : [])]} />
        <HiddenHeading ref={heading} tabIndex={-1}>{title}</HiddenHeading>
        {children}
        <LinkButton type="button" onClick={toggle}>{messages.text("details.collapse", { section: title })}</LinkButton>
      </Panel>}
    </div>
  </Card>;
}

/** A nested item view inside an opened section; Back returns to the list with its filters and page. */
export function ItemPanel({ itemKey, title, accent = "blue", children }: { itemKey: string; title: string; accent?: AccentName; children: ReactNode }) {
  const { view, go, messages } = useDetails();
  const heading = useRevealOnOpen<HTMLHeadingElement>(true, itemKey, "card");
  return <Panel data-item-panel={itemKey} style={{ borderColor: "transparent", paddingBlockStart: 0 }}>
    <LinkButton type="button" onClick={() => go({ ...view, item: null })}>‹ {messages.text("details.backToList")}</LinkButton>
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
