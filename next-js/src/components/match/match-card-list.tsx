"use client";

import type { ComponentPropsWithRef } from "react";
import styled, { css } from "styled-components";
import { createMessages } from "@/i18n/messages";
import { useDesktopLayout } from "@/components/ui/use-desktop-layout";
import { media } from "@/styles/theme";
import { DesktopContent } from "@/components/ui/layout";
import { alignedLedgerStyles, desktopMatchBaseStyles } from "./desktop-match-styles";
import { MatchCardLayoutContext } from "./match-card-layout";

export type MatchCardListProps = Omit<ComponentPropsWithRef<"ul">, "role"> & {
  locale?: string; rowNumberMaximum?: number;
};

const Board = styled.div<{ $indexLength: number }>`
  min-inline-size: 0;
  --match-card-hover: ${({ theme }) => `color-mix(in srgb, ${theme.color.rowHover} 30%, ${theme.color.surface})`};
  /* Root-relative tracks stay identical across bold header digits and regular row digits. */
  ${({ $indexLength }) => $indexLength > 0 && css`--match-index-width: max(var(--gh-size-6), calc(${$indexLength} * var(--gh-size-2) + var(--gh-size-0_5)));`}
  ${media.desktop} {
    ${desktopMatchBaseStyles}
    ${alignedLedgerStyles}
    [data-row-market] > [data-market-label] { min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; }
    [data-row-market] > [data-pick-line] { flex: none; }
    [data-row-odds] { justify-content: flex-start; }
    [data-row-market], [data-row-odds], [data-row-probability] { gap: var(--gh-spacing-0_75); }
    [data-row-odds] > [data-number-label] { flex: none; }
    [data-row-odds] > strong { min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; text-align: end; }
    [data-centre][data-live-clock] {
      block-size: auto;
      grid-template-areas: "clock" "score";
      row-gap: var(--gh-spacing-0_5);
    }
    [data-centre][data-live-clock] [data-score] { grid-area: score; }
    [data-centre][data-live-clock] [data-clock] {
      grid-area: clock;
      position: static;
      transform: none;
      max-inline-size: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: var(--gh-font-secondary);
      font-weight: ${({ theme }) => theme.typography.weight.semibold};
      line-height: var(--gh-size-3_5);
    }
    background: ${({ theme }) => theme.color.page};
    border: 0;
    border-radius: ${({ theme }) => theme.radius.none};
    box-shadow: none;
  }
`;
const List = styled.ul`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0;
  padding: 0;
  margin: 0;
  list-style: none;
  min-inline-size: 0;
  border: ${({ theme }) => theme.phoneCardFrame.ruleWidth} solid ${({ theme }) => theme.phoneCardFrame.separator};

  > li { display: grid; min-inline-size: 0; }
  /* A row owns the separator even when its contents change layout or include a wrapper. */
  > li ~ li {
    border-block-start: ${({ theme }) => theme.phoneCardFrame.ruleWidth} solid
      ${({ theme }) => `color-mix(in srgb, ${theme.phoneCardFrame.separator}, ${theme.color.controlBorder} 40%)`};
  }
  > li > :is(article, [data-desktop-row]) {
    border-radius: ${({ theme }) => theme.radius.none};
    background: ${({ theme }) => theme.color.surface};
    ${media.hover} { &:hover { background: var(--match-card-hover); } }
  }
  > li > article > [data-match-open], > li > [data-desktop-row] > [data-match-analysis-link] { border-radius: inherit; }
  ${media.belowDesktop} {
    /* Keep every match searchable and accessible while deferring offscreen layout.
     * Remember measured heights as visitors scroll; the item shares the card's phone-frame tokens. */
    > li { container-type: inline-size; content-visibility: auto; contain-intrinsic-block-size: auto var(--gh-size-28); }
    > li:has(> article) { box-shadow: ${({ theme }) => theme.phoneCardFrame.shadow}; }
  }

  ${media.desktop} {
    grid-template-columns: minmax(0, 1fr);
    > li { background: ${({ theme }) => theme.color.surface}; }
  }
`;
const Divider = styled.li`
  && {
    display: grid;
    gap: var(--gh-spacing-0_5);
    padding: var(--gh-spacing-2_5) var(--gh-spacing-0_5) var(--gh-spacing-0_5);
    content-visibility: visible;
    contain-intrinsic-block-size: none;
  }
  > h2 { color: ${({ theme }) => theme.color.text}; font-size: ${({ theme }) => theme.typography.scale.emphasis}; }
  > p { color: ${({ theme }) => theme.color.mutedText}; font-size: ${({ theme }) => theme.typography.scale.secondary}; }
  ${media.desktop} {
    && { padding: var(--gh-spacing-2_5) var(--gh-spacing-4); background: ${({ theme }) => theme.color.brandSoft}; }
    > h2 { font-size: var(--gh-font-reading); }
  }
`;

/** A titled break inside the list, such as the start of similar search results. Its heading shares the level of the
 * cards' own titles, so heading navigation meets it between the last exact match and the first similar one. */
export function MatchListDivider({ title, note, as = "li" }: { title: string; note?: string | null; as?: "li" | "div" }) {
  return <Divider as={as} data-list-divider=""><h2>{title}</h2>{note && <p>{note}</p>}</Divider>;
}

/** Shared Team stack cards below 64rem and the slip/builder's Aligned ledger rows above it. */
export function MatchCardList({ locale, rowNumberMaximum, ...props }: MatchCardListProps) {
  const desktop = useDesktopLayout();
  const messages = createMessages(locale);
  const indexLabel = rowNumberMaximum !== undefined && Number.isSafeInteger(rowNumberMaximum) && rowNumberMaximum > 0
    ? messages.number(Math.min(rowNumberMaximum, 9_999)) : "";
  return <MatchCardLayoutContext.Provider value={desktop}><DesktopContent data-match-section><Board $indexLength={indexLabel.length} data-match-board>
    <List role="list" data-match-list {...props} />
  </Board></DesktopContent></MatchCardLayoutContext.Provider>;
}
