"use client";

import styled from "styled-components";
import { MobileSlipHeader } from "../compact-slip/mobile-slip-header";

/** Shared tracks keep every divider fixed while only the review header's treatment changes. */
export const HeaderRow = styled(MobileSlipHeader)`
  --header-height: 32px;
  --header-rule: ${({ theme }) => theme.color.border};
  background: ${({ theme }) => theme.color.cardHeader};
  [data-header-field] strong { font-weight: 700; }

  &[data-header-variant="continuous-rules"] { --header-height: 30px; }
  &[data-header-variant="inset-rules"] {
    [data-header-field], [data-header-status] { border-color: transparent; }
    [data-header-field]::before, [data-header-status]::before, [data-header-status]::after {
      content: ""; position: absolute; inset-block: 5px; inline-size: 1px; background: var(--header-rule);
    }
    [data-header-field]::before, [data-header-status]::before { inset-inline-start: -1px; }
    [data-header-status]::after { inset-inline-end: -1px; }
  }
  &[data-header-variant="strong-rules"] { --header-rule: ${({ theme }) => theme.color.controlBorder}; }
  &[data-header-variant="status-cell"] [data-header-status] { background: var(--header-status-fill); }
  &[data-header-variant="metric-cells"] [data-header-field] { background: ${({ theme }) => theme.color.surface}; }
  &[data-header-variant="centered-columns"] {
    > h3, [data-header-field] { justify-content: center; }
  }
  &[data-header-variant="right-aligned"] {
    --header-height: 30px;
    [data-header-field] { justify-content: flex-end; }
  }
  &[data-header-variant="minimal-rules"] {
    --header-height: 28px;
    --header-rule: ${({ theme }) => `color-mix(in srgb, ${theme.color.border} 65%, transparent)`};
    background: ${({ theme }) => theme.color.surface};
    [data-header-field] strong { font-weight: 600; }
  }
  &[data-header-variant="bold-identity"] {
    --header-height: 34px;
    > h3 { color: ${({ theme }) => theme.color.link}; font-weight: 800; }
  }

`;
