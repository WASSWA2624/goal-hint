"use client";

import type { ComponentPropsWithRef } from "react";
import styled from "styled-components";
import { createMessages } from "@/i18n/messages";
import { matchTableColumns, matchTableGap } from "./match-columns";

export type MatchCardListProps = Omit<ComponentPropsWithRef<"ul">, "role"> & { locale?: string };

const Board = styled.div`
  min-inline-size: 0;
  @media (min-width: ${({ theme }) => theme.breakpoint.lg}) {
    overflow: hidden;
    background: ${({ theme }) => theme.color.surface};
    border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
    border-radius: 14px;
    box-shadow: ${({ theme }) => theme.shadow.card};
  }
`;
/** Decorative column labels; every row repeats its meaning in accessible text. */
const Columns = styled.div`
  display: none;
  @media (min-width: ${({ theme }) => theme.breakpoint.lg}) {
    display: grid;
    grid-template-columns: ${matchTableColumns};
    column-gap: ${matchTableGap};
    padding: 12px 16px;
    color: ${({ theme }) => theme.color.onBrand};
    background: ${({ theme }) => theme.color.text};
    font-size: 0.8125rem;
    font-weight: ${({ theme }) => theme.typography.weight.bold};
    line-height: ${({ theme }) => theme.typography.lineHeight.heading};
    > span:nth-child(5) { text-align: center; }
  }
`;
const List = styled.ul`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: ${({ theme }) => theme.space.md};
  padding: 0;
  margin: 0;
  list-style: none;
  min-inline-size: 0;

  > li { display: grid; min-inline-size: 0; }

  @media (min-width: ${({ theme }) => theme.breakpoint.md}) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  @media (min-width: ${({ theme }) => theme.breakpoint.lg}) {
    grid-template-columns: minmax(0, 1fr);
    gap: 0;
    > li + li { border-block-start: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border}; }
  }
`;

/** Cards below 64rem, an aligned match table above it. Source order is also visual and keyboard order. */
export function MatchCardList({ locale, ...props }: MatchCardListProps) {
  const messages = createMessages(locale);
  return <Board>
    <Columns aria-hidden="true">
      <span>{messages.text("match.columns.number")}</span><span>{messages.text("match.columns.time")}</span>
      <span>{messages.text("match.columns.league")}</span><span>{messages.text("match.columns.home")}</span>
      <span>{messages.text("match.versus")}</span><span>{messages.text("match.columns.away")}</span>
      <span>{messages.text("match.columns.market")}</span><span>{messages.text("match.columns.prediction")}</span><span />
    </Columns>
    <List role="list" {...props} />
  </Board>;
}
