"use client";

import styled from "styled-components";
import { DesktopSlipBase, subtleDividerStyles } from "../desktop-slip/desktop-slip-styles";

/** Review candidates extend the production geometry without duplicating it. */
export const DesktopSlipLayout = styled(DesktopSlipBase)`
  &[data-desktop-design="inline-columns"] {
    [data-desktop-row] { column-gap: 0; --desktop-columns: 4rem 5.5rem minmax(5.5rem, 1fr) minmax(3.75rem, 0.7fr) minmax(8rem, 2fr) minmax(6.5rem, 1fr) 4.6rem 5rem; }
    [data-desktop-row] > :not(:first-child) { border-inline-start: 1px solid ${({ theme }) => theme.color.border}; padding-inline: 6px; }
    [data-row-odds], [data-row-probability] { justify-content: center; }
  }
  &[data-desktop-design="fixture-priority"] {
    [data-desktop-row] { --desktop-columns: 3.5rem 5rem minmax(4.75rem, 0.8fr) minmax(3.25rem, 0.5fr) minmax(9rem, 2.7fr) minmax(6rem, 0.9fr) 4.2rem 4.8rem; }
    [data-row-teams] { border-inline: 2px solid ${({ theme }) => theme.color.border}; padding-inline: 7px; }
  }
  &[data-desktop-design="market-panel"] {
    [data-desktop-row] { --desktop-columns: 3.5rem 5rem minmax(5rem, 0.9fr) minmax(3.5rem, 0.6fr) minmax(8rem, 1.9fr) minmax(7rem, 1.1fr) 4.2rem 4.8rem; min-block-size: 2.375rem; }
    [data-row-market] { align-self: stretch; justify-content: center; padding-inline: 5px; background: ${({ theme }) => theme.color.brandSoft}; }
  }
  &[data-desktop-design="odds-anchor"] {
    [data-desktop-row] { --desktop-columns: 3.5rem 5rem minmax(5rem, 1fr) minmax(3.5rem, 0.6fr) minmax(8rem, 2fr) minmax(6.5rem, 0.95fr) 4.5rem 4.8rem; }
    [data-row-odds] { align-self: stretch; padding-inline: 5px; background: ${({ theme }) => theme.color.surfaceMuted}; border-inline-start: 2px solid ${({ theme }) => theme.color.border}; }
    [data-row-odds] strong { font-weight: ${({ theme }) => theme.typography.weight.heavy}; }
  }
  &[data-desktop-design="probability-anchor"] {
    [data-row-probability] { align-self: stretch; border-inline-start: 2px solid ${({ theme }) => theme.color.brand}; padding-inline-start: 6px; }
    [data-row-probability] strong { color: ${({ theme }) => theme.color.link}; font-weight: ${({ theme }) => theme.typography.weight.heavy}; }
  }
  &[data-desktop-design="country-rail"] {
    [data-desktop-row] { --desktop-columns: 3.5rem 5rem minmax(5rem, 1fr) minmax(4.5rem, 0.95fr) minmax(8rem, 1.9fr) minmax(6rem, 0.85fr) 4.2rem 4.8rem; }
    [data-row-country] { border-inline-end: 1px solid ${({ theme }) => theme.color.border}; padding-inline-end: 6px; }
    [data-row-league] { font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  }
  &[data-desktop-design="alternating-lines"] {
    li:nth-child(even) [data-desktop-row] { background: ${({ theme }) => theme.color.cardHeader}; }
    li + li { border-block-start-color: transparent; }
    [data-desktop-row] { min-block-size: 2.125rem; padding-block: 3px; }
  }
  &[data-desktop-design="subtle-dividers"] { ${subtleDividerStyles} }
  &[data-desktop-design="minimal-line"] {
    [data-desktop-row] { min-block-size: 2rem; padding: 3px 10px; column-gap: 6px; }
    [data-row-odds] strong, [data-row-probability] strong { font-weight: ${({ theme }) => theme.typography.weight.medium}; }
  }

`;
