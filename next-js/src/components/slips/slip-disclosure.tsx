"use client";

import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { createMessages } from "@/i18n/messages";
import { SlipCard, SlipDetails, SlipTitle, SlipToggle, SlipToggleHint } from "./slip-styles";

/** Phrasing elements keep facts valid inside a native summary while retaining clear label/value pairs. */
export function SlipFact({ label, children, ...props }: Omit<ComponentPropsWithoutRef<"span">, "children"> & {
  label: ReactNode; children: ReactNode;
}) {
  return <span {...props} data-slip-fact><span data-slip-fact-label>{label}</span><span data-slip-fact-value>{children}</span></span>;
}

/** The entire summary toggles natively, including before hydration and with Enter or Space. */
export function SlipDisclosure({ summary, children, locale, slipId, collapsible = true }: {
  summary: ReactNode; children: ReactNode; locale: string; slipId?: string; collapsible?: boolean;
}) {
  const messages = createMessages(locale);
  return <SlipCard data-slip-id={slipId}>
    {collapsible ? <SlipDetails data-slip-disclosure>
      <SlipToggle data-slip-toggle>
        {summary}
        <SlipToggleHint aria-hidden="true">
          <span data-slip-expand>{messages.text("slips.showMatches")}</span>
          <span data-slip-collapse>{messages.text("slips.hideMatches")}</span>
        </SlipToggleHint>
      </SlipToggle>
      <div data-slip-content>{children}</div>
    </SlipDetails> : <><SlipTitle>{summary}</SlipTitle>{children}</>}
  </SlipCard>;
}
