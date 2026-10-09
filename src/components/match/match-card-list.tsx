"use client";

import styled from "styled-components";

/** Callers supply list items; source order is also visual and keyboard order. */
export const MatchCardList = styled.ul.attrs({ role: "list" })`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: ${({ theme }) => theme.space.md};
  padding: 0;
  margin: 0;
  list-style: none;
  min-inline-size: 0;

  > li { display: grid; min-inline-size: 0; }

  @media (min-width: ${({ theme }) => theme.breakpoint.lg}) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;
