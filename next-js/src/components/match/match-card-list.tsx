"use client";

import type { ComponentPropsWithRef } from "react";
import styled, { css } from "styled-components";
import { createMessages } from "@/i18n/messages";
import { useDesktopLayout } from "@/components/ui/use-desktop-layout";
import { media } from "@/styles/theme";
import { alignedLedgerStyles, desktopMatchBaseStyles } from "./desktop-match-styles";
import { MatchCardLayoutContext } from "./match-card-layout";

export type MatchCardListProps = Omit<ComponentPropsWithRef<"ul">, "role"> & {
  locale?: string; rowNumberMaximum?: number;
};

const Board = styled.div<{ $indexLength: number }>`
  min-inline-size: 0;
  /* Root-relative tracks stay identical across bold header digits and regular row digits. */
  ${({ $indexLength }) => $indexLength > 0 && css`--match-index-width: max(1.5rem, calc(${$indexLength} * 0.5rem + 2px));`}
  ${media.desktop} {
    ${desktopMatchBaseStyles}
    ${alignedLedgerStyles}
    background: ${({ theme }) => theme.color.surface};
    border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
    border-radius: 0;
    box-shadow: none;
  }
`;
const List = styled.ul`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 6px;
  padding: 0;
  margin: 0;
  list-style: none;
  min-inline-size: 0;

  > li { display: grid; min-inline-size: 0; }
  ${media.belowDesktop} {
    /* Keep framed cards separate and every match searchable and accessible while deferring offscreen layout.
     * Remember measured heights as visitors scroll; the item shares the card's phone-frame tokens. */
    gap: 6px;
    > li { content-visibility: auto; contain-intrinsic-block-size: auto 84px; }
    > li:has(> article:only-child) { border-radius: ${({ theme }) => theme.phoneCardFrame.radius}; box-shadow: ${({ theme }) => theme.phoneCardFrame.shadow}; }
  }

  ${media.desktop} {
    grid-template-columns: minmax(0, 1fr);
    gap: 0;
    > li + li { border-block-start: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border}; }
  }
`;
const Divider = styled.li`
  && {
    display: grid;
    gap: 2px;
    padding: 10px 2px 2px;
    content-visibility: visible;
    contain-intrinsic-block-size: none;
  }
  > h2 { color: ${({ theme }) => theme.color.text}; font-size: ${({ theme }) => theme.typography.scale.emphasis}; }
  > p { color: ${({ theme }) => theme.color.mutedText}; font-size: ${({ theme }) => theme.typography.scale.secondary}; }
  ${media.desktop} {
    && { padding: 10px 16px; background: ${({ theme }) => theme.color.brandSoft}; }
    > h2 { font-size: 0.9375rem; }
  }
`;

/** A titled break inside the list, such as the start of similar search results. Its heading shares the level of the
 * cards' own titles, so heading navigation meets it between the last exact match and the first similar one. */
export function MatchListDivider({ title, note }: { title: string; note?: string | null }) {
  return <Divider data-list-divider=""><h2>{title}</h2>{note && <p>{note}</p>}</Divider>;
}

/** Shared Clean ledger cards below 64rem and the slip/builder's Aligned ledger rows above it. */
export function MatchCardList({ locale, rowNumberMaximum, ...props }: MatchCardListProps) {
  const desktop = useDesktopLayout();
  const messages = createMessages(locale);
  const indexLabel = rowNumberMaximum !== undefined && Number.isSafeInteger(rowNumberMaximum) && rowNumberMaximum > 0
    ? messages.number(Math.min(rowNumberMaximum, 9_999)) : "";
  return <MatchCardLayoutContext.Provider value={desktop}><Board $indexLength={indexLabel.length} data-match-board>
    <List role="list" {...props} />
  </Board></MatchCardLayoutContext.Provider>;
}
