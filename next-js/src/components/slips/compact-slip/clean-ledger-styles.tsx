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
    padding-block: var(--gh-spacing-1_25); row-gap: var(--gh-spacing-0_5);
    [data-ledger-teams] { row-gap: var(--gh-spacing-0_25); }
    [data-ledger-facts] { row-gap: var(--gh-spacing-0_5); }
  }
  &:focus-visible { outline: var(--gh-stroke-strong) solid ${({ theme }) => theme.color.focus}; outline-offset: calc(-1 * var(--gh-size-0_5)); }
  @media (hover: hover) { &[href]:hover { background: ${({ theme }) => theme.color.rowHover}; } }
`;
