import { css } from "styled-components";

/** One joined selection stack for compact and desktop slips, without clipping focus or tooltips. */
export const joinedSlipSelections = css`
  [data-slip-content] > [data-slip-selections] { gap: 0; padding: var(--gh-spacing-1_5); }
  [data-slip-selections] > [data-slip-selection] + [data-slip-selection] {
    border-block-start: ${({ theme }) => theme.phoneCardFrame.ruleWidth} solid ${({ theme }) => theme.phoneCardFrame.separator};
  }
  [data-slip-selections] > [data-slip-selection] > [data-fixture-id] {
    border-radius: ${({ theme }) => theme.radius.none};
    background: ${({ theme }) => theme.phoneCardFrame.selection};
  }
  [data-slip-selections] > [data-slip-selection]:first-child > [data-fixture-id] {
    border-start-start-radius: ${({ theme }) => theme.phoneCardFrame.radius};
    border-start-end-radius: ${({ theme }) => theme.phoneCardFrame.radius};
  }
  [data-slip-selections] > [data-slip-selection]:last-child > [data-fixture-id] {
    border-end-start-radius: ${({ theme }) => theme.phoneCardFrame.radius};
    border-end-end-radius: ${({ theme }) => theme.phoneCardFrame.radius};
  }
  [data-slip-selections] > [data-slip-selection] > [data-fixture-id] > [data-row-analysis] { border-radius: inherit; }
  @media (hover: hover) {
    [data-slip-selections] > [data-slip-selection] > [data-fixture-id]:is([href], :has([data-row-analysis])):hover {
      background: ${({ theme }) => theme.color.rowHover};
    }
  }
`;
