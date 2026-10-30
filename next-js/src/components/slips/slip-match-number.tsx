"use client";

import styled from "styled-components";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { createMessages } from "@/i18n/messages";

const Number = styled.span`
  flex: none; color: ${({ theme }) => theme.color.text};
  font-weight: ${({ theme }) => theme.typography.weight.medium};
  font-variant-numeric: tabular-nums; white-space: nowrap;
`;

/** Ordinals describe the selected order within this slip, never the fixture's global rank. */
export function SlipMatchNumber({ position, locale }: { position: number; locale: string }) {
  const m = createMessages(locale), number = m.number(position);
  return <Number data-slip-match-number={position}>
    <VisuallyHidden>{m.text("slips.matchNumber", { number })}</VisuallyHidden>
    <span aria-hidden="true">{number}</span>
  </Number>;
}
