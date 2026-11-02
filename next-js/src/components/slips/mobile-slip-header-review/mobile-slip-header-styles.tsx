"use client";

import styled from "styled-components";
import { MobileSlipHeader } from "../compact-slip/mobile-slip-header";

/** Shared tracks keep every divider fixed while only the review header's treatment changes. */
export const HeaderRow = styled(MobileSlipHeader)`
  --header-height: var(--gh-size-8);
  --header-rule: ${({ theme }) => theme.color.border};
  background: ${({ theme }) => theme.color.cardHeader};
  [data-header-field] strong { font-weight: var(--gh-weight-bold); }

  &[data-header-variant="continuous-rules"] { --header-height: var(--gh-size-7_5); }
  &[data-header-variant="inset-rules"] {
    [data-header-field], [data-header-status] { border-color: transparent; }
    [data-header-field]::before, [data-header-status]::before, [data-header-status]::after {
      content: ""; position: absolute; inset-block: var(--gh-spacing-1_25); inline-size: var(--gh-size-0_25); background: var(--header-rule);
    }
    [data-header-field]::before, [data-header-status]::before { inset-inline-start: calc(-1 * var(--gh-spacing-0_25)); }
    [data-header-status]::after { inset-inline-end: calc(-1 * var(--gh-spacing-0_25)); }
  }
  &[data-header-variant="strong-rules"] { --header-rule: ${({ theme }) => theme.color.controlBorder}; }
  &[data-header-variant="status-cell"] [data-header-status] { background: var(--header-status-fill); }
  &[data-header-variant="metric-cells"] [data-header-field] { background: ${({ theme }) => theme.color.surface}; }
  &[data-header-variant="centered-columns"] {
    > h3, [data-header-field] { justify-content: center; }
  }
  &[data-header-variant="right-aligned"] {
    --header-height: var(--gh-size-7_5);
    [data-header-field] { justify-content: flex-end; }
  }
  &[data-header-variant="minimal-rules"] {
    --header-height: var(--gh-size-7);
    --header-rule: ${({ theme }) => `color-mix(in srgb, ${theme.color.border} 65%, transparent)`};
    background: ${({ theme }) => theme.color.surface};
    [data-header-field] strong { font-weight: var(--gh-weight-semibold); }
  }
  &[data-header-variant="bold-identity"] {
    --header-height: var(--gh-size-8_5);
    > h3 { color: ${({ theme }) => theme.color.link}; font-weight: var(--gh-weight-heavy); }
  }

`;
