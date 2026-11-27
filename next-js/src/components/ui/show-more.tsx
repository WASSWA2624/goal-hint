"use client";

import styled, { keyframes } from "styled-components";
import type { Messages } from "@/i18n/messages";
import { media } from "@/styles/theme";
import { Button } from "./controls";
import { ChevronDownIcon, Icon } from "./icons";

const Frame = styled.div`
  display: grid;
  justify-items: center;
  gap: var(--gh-spacing-1);
  padding-block: var(--gh-spacing-1);
  overflow-anchor: none;
`;
const Action = styled(Button)`
  &[aria-disabled="true"] { cursor: wait; }
  > svg { flex: none; }
`;
const turn = keyframes`to { transform: rotate(360deg); }`;
const Progress = styled(Icon)`
  @media (prefers-reduced-motion: no-preference) {
    animation: ${turn} var(--gh-duration-spin) var(--gh-easing-linear) infinite;
  }
`;
const Status = styled.span`
  color: ${({ theme }) => theme.color.mutedText};
  font-size: var(--gh-font-secondary);
  text-align: center;
  ${media.desktop} { max-inline-size: ${({ theme }) => theme.layout.readingMaxWidth}; }
`;

export function ShowMore({ hasMore, onShowMore, messages, loading = false, failed = false, disabled = false, className }: {
  hasMore: boolean;
  onShowMore: () => void;
  messages: Messages;
  loading?: boolean;
  failed?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  if (!hasMore) return null;
  const blocked = disabled || loading;
  return <Frame className={className}>
    {failed && !loading && <Status role="status" data-show-more-status>{messages.text("pagination.loadFailed")}</Status>}
    <Action variant="quiet" type="button" data-show-more aria-disabled={blocked || undefined} aria-busy={loading || undefined}
      onClick={() => { if (!blocked) onShowMore(); }}>
      {loading ? <Progress><path d="M12 3a9 9 0 1 1-9 9" /></Progress> : <ChevronDownIcon />}
      <span aria-live="polite">{messages.text(loading ? "history.loading" : failed ? "pagination.retryMore" : "pagination.showMore")}</span>
    </Action>
  </Frame>;
}
