"use client";

import styled from "styled-components";
import { teamStackStyles } from "@/components/match/team-stack-styles";
import { media } from "@/styles/theme";

/** Slip selections use the same approved Team stack geometry as feed cards. */
export const CleanLedgerRow = styled.div`
  ${teamStackStyles}
  --match-surface: ${({ theme }) => theme.phoneCardFrame.selection};
  border: 0;
  border-radius: ${({ theme }) => theme.phoneCardFrame.radius};
  background: var(--match-surface);
  text-decoration: none;
  ${media.belowDesktop} {
    padding-block: 5px; row-gap: 2px;
    [data-ledger-teams] { row-gap: 1px; }
    [data-ledger-facts] { row-gap: 2px; }
  }
  &:focus-visible { outline: 2px solid ${({ theme }) => theme.color.focus}; outline-offset: -2px; }
  @media (hover: hover) { &[href]:hover { background: ${({ theme }) => theme.color.rowHover}; } }
`;
