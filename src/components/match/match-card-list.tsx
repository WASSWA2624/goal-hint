"use client";

import type { ComponentPropsWithRef } from "react";
import styled from "styled-components";
import { createMessages } from "@/i18n/messages";
import { media } from "@/styles/theme";
import { matchTableColumns, matchTableGap } from "./match-columns";

export type MatchCardListProps = Omit<ComponentPropsWithRef<"ul">, "role"> & { locale?: string };

const Board = styled.div`
  min-inline-size: 0;
  ${media.desktop} {
    overflow: hidden;
    background: ${({ theme }) => theme.color.surface};
    border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
    border-radius: ${({ theme }) => theme.border.cardRadius};
    box-shadow: ${({ theme }) => theme.shadow.card};
  }
`;
/** Decorative column labels; every row repeats its meaning in accessible text. */
const Columns = styled.div`
  display: none;
  ${media.desktop} {
    display: grid;
    grid-template-columns: ${matchTableColumns.compact};
    column-gap: ${matchTableGap};
    padding: 12px 16px;
    color: ${({ theme }) => theme.color.onBrand};
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

  ${media.desktop} {
    grid-template-columns: minmax(0, 1fr);
    gap: 0;
    > li + li { border-block-start: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border}; }
    > li:nth-child(even) { background: ${({ theme }) => theme.color.cardHeader}; }
  }
`;

/** Cards below 64rem, an aligned match table above it. Source order is also visual and keyboard order. */
export function MatchCardList({ locale, ...props }: MatchCardListProps) {
  const messages = createMessages(locale);
  return <Board>
    <Columns aria-hidden="true">
      <span>{messages.text("match.columns.number")}</span><span>{messages.text("match.columns.dateTime")}</span>
      <span>{messages.text("match.columns.league")}</span><span>{messages.text("match.columns.home")}</span>
      <span>{messages.text("match.versus")}</span><span>{messages.text("match.columns.away")}</span>
      <span>{messages.text("match.columns.market")}</span><span>{messages.text("match.columns.prediction")}</span>
      <span><span data-short>{messages.text("match.columns.probabilityShort")}</span><span data-full>{messages.text("match.columns.probability")}</span></span><span />
    </Columns>
    <List role="list" {...props} />
  </Board>;
}
