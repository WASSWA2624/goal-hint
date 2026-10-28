"use client";

import type { ComponentPropsWithRef } from "react";
import styled, { css } from "styled-components";
import { createMessages } from "@/i18n/messages";
import { media } from "@/styles/theme";
import { matchTableColumns, matchTableGap } from "./match-columns";
import { PredictionDefinitions } from "./prediction-definitions";

export type MatchCardListProps = Omit<ComponentPropsWithRef<"ul">, "role"> & {
  locale?: string; rowNumberMaximum?: number; showPredictionDefinitions?: boolean;
};

const Board = styled.div<{ $indexLength: number }>`
  min-inline-size: 0;
  /* Root-relative tracks stay identical across bold header digits and regular row digits. */
  ${({ $indexLength }) => $indexLength > 0 && css`--match-index-width: max(1.5rem, calc(${$indexLength} * 0.5rem + 2px));`}
  ${media.desktop} {
    background: ${({ theme }) => theme.color.surface};
    border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
    border-radius: 0;
    box-shadow: none;
  }
`;
/** Decorative column labels; every row repeats its meaning in accessible text. */
const Columns = styled.div`
  display: none;
  ${media.desktop} {
    position: sticky;
    inset-block-start: var(--app-header-height, calc(4rem + 2px));
    z-index: 10;
    display: grid;
    grid-template-columns: ${matchTableColumns.compact};
    column-gap: ${matchTableGap};
    padding: 12px 16px;
    color: ${({ theme }) => theme.header.text};
    background: ${({ theme }) => theme.gradient.tableHeader};
    font-size: 0.8125rem;
    font-weight: ${({ theme }) => theme.typography.weight.bold};
    line-height: ${({ theme }) => theme.typography.lineHeight.heading};
    > span:nth-child(4) { text-align: end; }
    > span:nth-child(5) { text-align: center; }
    [data-full] { display: none; }
  }
  ${media.wide} {
    grid-template-columns: ${matchTableColumns.full};
    [data-short] { display: none; }
    [data-full] { display: inline; }
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
    /* A divider row does not shift the stripes of the match rows after it. */
    > li:nth-child(even of :not([data-list-divider])) { background: ${({ theme }) => theme.color.cardHeader}; }
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

/** Cards below 64rem, an aligned match table above it. Source order is also visual and keyboard order. */
export function MatchCardList({ locale, rowNumberMaximum, showPredictionDefinitions = true, ...props }: MatchCardListProps) {
  const messages = createMessages(locale);
  const indexLabel = rowNumberMaximum !== undefined && Number.isSafeInteger(rowNumberMaximum) && rowNumberMaximum > 0
    ? messages.number(Math.min(rowNumberMaximum, 9_999)) : "";
  return <>
    {showPredictionDefinitions && <PredictionDefinitions locale={locale ?? "en"} />}
    <Board $indexLength={indexLabel.length} data-match-board>
      <Columns aria-hidden="true" data-match-table-header>
        <span>{messages.text("match.columns.number")}</span><span>{messages.text("match.columns.dateTime")}</span>
        <span>{messages.text("match.columns.league")}</span><span>{messages.text("match.columns.home")}</span>
        <span>{messages.text("match.columns.score")}</span><span>{messages.text("match.columns.away")}</span>
        <span>{messages.text("match.columns.market")}</span><span>{messages.text("match.columns.prediction")}</span>
        <span>{messages.text("details.odds")}</span>
        <span><span data-short>{messages.text("match.columns.probabilityShort")}</span><span data-full>{messages.text("match.columns.probability")}</span></span>
        <span>{messages.text("match.columns.result")}</span><span />
      </Columns>
      <List role="list" {...props} />
    </Board>
  </>;
}
